import hmac
import hashlib
import base64
import secrets
import uuid
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Dict, Tuple, List
import jwt
from cryptography.fernet import Fernet
from fastapi import HTTPException, status
from backend.config import settings
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization

try:
    from jose import JWTError as JoseJWTError
except Exception:  # pragma: no cover - optional dependency fallback
    JoseJWTError = jwt.InvalidTokenError

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS

try:
    fernet_key = base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest())
    cipher_suite = Fernet(fernet_key)
except Exception as e:
    raise RuntimeError(f"Critical Boot Error: Failed to initialize AES Cipher Suite: {str(e)}")


class JWTManager:

    @staticmethod
    def create_access_token(data: Dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create a short-lived access token."""
        try:
            to_encode = data.copy()
            if expires_delta:
                expire = datetime.now(timezone.utc) + expires_delta
            else:
                expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

            to_encode.update({"exp": expire, "type": "access"})
            return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        except Exception as e:
            raise RuntimeError(f"Internal Access Token Generation Exception: {str(e)}")

    @staticmethod
    def create_refresh_token(data: Dict) -> str:
        """Create a long-lived refresh token with the essential identity fields."""
        try:
            token_id = data.get("jti") or str(uuid.uuid4())
            to_encode = {
                "sub": str(data.get("sub")),
                "email": data.get("email"),
                "company_id": str(data.get("company_id") or data.get("sub")),
                "type": "refresh",
                "jti": token_id,
            }
            expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

            to_encode.update({"exp": expire})
            return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        except Exception as e:
            raise RuntimeError(f"Internal Refresh Token Generation Exception: {str(e)}")

    @staticmethod
    def decode_token(token: str) -> Optional[dict]:
        """Decode and validate a JWT token."""
        try:
            return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except (JoseJWTError, jwt.PyJWTError, ValueError, TypeError):
            return None

    @staticmethod
    def decode_access_token(token: str) -> Optional[dict]:
        """Decode an access token using the shared JWT logic."""
        return JWTManager.decode_token(token)


SENSITIVE_FIELD_NAMES = {
    "authorization",
    "api_key",
    "apikey",
    "apikeys",
    "cookie",
    "credit_card",
    "password",
    "passwd",
    "secret",
    "token",
    "x-api-key",
    "x-hub-signature",
}


def _normalize_key(key: str) -> str:
    return key.lower().replace("-", "_").replace(" ", "_")


def sanitize_for_logging(value: Any, max_length: int = 2000) -> Any:
    """Recursively scrub sensitive values from headers, payloads, and nested containers."""
    if isinstance(value, dict):
        sanitized = {}
        for key, child in value.items():
            if _normalize_key(str(key)) in SENSITIVE_FIELD_NAMES:
                sanitized[key] = "[REDACTED]"
            else:
                sanitized[key] = sanitize_for_logging(child, max_length=max_length)
        return sanitized

    if isinstance(value, list):
        return [sanitize_for_logging(item, max_length=max_length) for item in value]

    if isinstance(value, (str, bytes, bytearray)):
        text = value.decode("utf-8", errors="ignore") if isinstance(value, (bytes, bytearray)) else value
        if len(text) <= max_length:
            return text
        return text[: max_length - 3] + "..."

    return value


def build_log_payload(event_id: str, request_headers: Optional[Dict[str, str]], request_payload: Any, **metadata: Any) -> Dict[str, Any]:
    """Create a structured payload that is safe for persistence to Redis/Postgres."""
    safe_headers = sanitize_for_logging(dict(request_headers or {}))
    safe_payload = sanitize_for_logging(request_payload)
    return {
        "event_id": event_id,
        "headers": safe_headers,
        "payload": safe_payload,
        **metadata,
    }


def validate_payload_keys(payload: Any, required_keys: Optional[List[str]], required_types: Optional[List[str]] = None) -> bool:
    """Validate a payload against a list of dotted paths such as user.id or billing.amount and their expected types."""
    if not required_keys:
        return True

    if not isinstance(payload, dict):
        return False

    for idx, key_path in enumerate(required_keys):
        current = payload
        parts = [part for part in str(key_path).split('.') if part]
        found = True
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                found = False
                break
        if not found:
            return False

        if required_types and idx < len(required_types):
            expected_type = str(required_types[idx]).strip().lower()
            if expected_type and expected_type not in ("any", ""):
                if expected_type == "string" and not isinstance(current, str):
                    return False
                elif expected_type == "number" and not (isinstance(current, (int, float)) and not isinstance(current, bool)):
                    return False
                elif expected_type == "integer" and not (isinstance(current, int) and not isinstance(current, bool)):
                    return False
                elif expected_type == "boolean" and not isinstance(current, bool):
                    return False
                elif expected_type == "object" and not isinstance(current, dict):
                    return False
                elif expected_type == "array" and not isinstance(current, list):
                    return False
    return True


class WebhookSecurity:

    @staticmethod
    def generate_raw_and_hash_key(project_id: int, company_id: int) -> Tuple[str, str]:
        """Create an encrypted API key and a hash for storage."""
        try:
            prefix = "gw_live"
            random_secret = secrets.token_hex(32)
            raw_combination = f"{prefix}:{project_id}:{company_id}:{random_secret}"
            encrypted_bytes = cipher_suite.encrypt(raw_combination.encode("utf-8"))
            client_api_key = encrypted_bytes.decode("utf-8")
            hashed_secret = hashlib.sha256(random_secret.encode("utf-8")).hexdigest()

            return client_api_key, hashed_secret

        except Exception as e:
            raise RuntimeError(f"Internal Key Generation Cryptography Exception: {str(e)}")

    @staticmethod
    def decode_and_parse_api_key(client_api_key: str) -> Tuple[int, int, str]:
        """Decrypt and validate an API key payload."""
        try:
            if not client_api_key:
                raise ValueError("Missing or invalid API key")

            decrypted_bytes = cipher_suite.decrypt(client_api_key.encode("utf-8"))
            decrypted_str = decrypted_bytes.decode("utf-8")
            parts = decrypted_str.split(":")

            if len(parts) != 4:
                raise ValueError("Key structure tampered")

            if parts[0] != "gw_live":
                raise ValueError("Invalid key prefix")

            project_id = int(parts[1])
            company_id = int(parts[2])
            incoming_secret = parts[3]

            return project_id, company_id, incoming_secret

        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid, Corrupted or Incomplete API Key structure",
            )

    @staticmethod
    def verify_secret_hash(incoming_secret: str, stored_hash: str) -> bool:
        """Compare a provided secret with a stored hash safely."""
        try:
            incoming_hash = hashlib.sha256(incoming_secret.encode("utf-8")).hexdigest()
            return hmac.compare_digest(incoming_hash, stored_hash)
        except Exception:
            return False

    @staticmethod
    def generate_webhook_secret() -> str:
        """Generate a unique webhook signing secret."""
        return f"whsec_{secrets.token_urlsafe(32)}"

    @staticmethod
    def sign_payload(payload: bytes, secret_key: str) -> str:
        """Sign payload for outbound webhook delivery.

        If `secret_key` appears to be a PEM-encoded RSA private key, use RSA PKCS1v15
        with SHA256 and return a base64-encoded signature. Otherwise fall back to
        HMAC-SHA256 hex digest for legacy symmetric signing.
        """
        try:
            if secret_key and secret_key.strip().startswith("-----BEGIN"):
                # Asymmetric RSA signing path (returns base64)
                try:
                    private_key = serialization.load_pem_private_key(
                        secret_key.encode("utf-8"),
                        password=None,
                    )
                except Exception:
                    # If loading fails, fall back to HMAC
                    return hmac.new(secret_key.encode("utf-8"), payload, hashlib.sha256).hexdigest()

                signature = private_key.sign(
                    payload,
                    padding.PKCS1v15(),
                    hashes.SHA256()
                )
                return base64.b64encode(signature).decode("utf-8")

            # Symmetric HMAC fallback (legacy)
            return hmac.new(secret_key.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        except Exception:
            return hmac.new((secret_key or "").encode("utf-8"), payload, hashlib.sha256).hexdigest()

    @staticmethod
    def verify_hmac_signature(payload: bytes, secret_key: str, incoming_signature: str) -> bool:
        """Validate an incoming payload signature."""
        try:
            if not incoming_signature:
                return False

            computed_signature = WebhookSecurity.sign_payload(payload, secret_key)
            return hmac.compare_digest(computed_signature, incoming_signature)
        except Exception:
            return False

   
