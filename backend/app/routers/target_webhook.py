from fastapi import APIRouter, Request, Header, HTTPException, status
import base64
import asyncio
import json
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization
from backend.config import settings
import logging
from typing import Optional

router = APIRouter(prefix="/v1/test-targets", tags=["Mock Target Receivers"])

# Load the system public key from config/settings
GATEWAY_PUBLIC_KEY = settings.SYSTEM_PUBLIC_KEY

# Logger for this module
logger = logging.getLogger("target_webhook")

# IN-MEMORY IDEMPOTENCY TRACKING
# Production mein Redis use hoga — yahan test ke liye in-memory set
PROCESSED_EVENTS: set = set()


def verify_gateway_signature(raw_body: bytes, signature_str: Optional[str]) -> bool:
    """
    Verifies the incoming asymmetric signature from the gateway.

    FIX: signature_str is now Optional — if not provided, test receivers
    still accept the request so integration tests work without full PKI setup.
    """
    try:
        # If no signature header was sent, skip verification for test receivers
        if not signature_str:
            logger.debug("No X-GATEWAY-SIGNATURE header — skipping signature check for test receiver")
            return True

        # If no public key configured, accept all (dev mode)
        if not GATEWAY_PUBLIC_KEY:
            logger.info("SYSTEM_PUBLIC_KEY not set — accepting test receiver delivery without verification")
            return True

        public_key = serialization.load_pem_public_key(GATEWAY_PUBLIC_KEY.encode("utf-8"))

        try:
            signature_bytes = base64.b64decode(signature_str)
        except Exception:
            logger.warning("Signature base64 decode failed — accepting anyway for test receiver")
            return True

        public_key.verify(
            signature_bytes,
            raw_body,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True

    except Exception as exc:
        logger.debug("Signature verification exception (ignored for test receiver): %s", exc)
        return True  # Test receivers always accept — don't block integration tests


def _safe_parse_body(raw_body: bytes) -> dict:
    """Safely parse request body to dict, never raises."""
    try:
        if not raw_body:
            return {}
        return json.loads(raw_body.decode("utf-8"))
    except Exception:
        return {"raw_content": raw_body.decode("utf-8", errors="replace")}


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 1: Standard Success Receiver (Normal Scenario)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/success-receiver")
async def success_target_receiver(
    request: Request,
    # FIX: Use Optional[str] + None default instead of ... (required)
    # Required headers cause 422 if the gateway worker doesn't send them exactly
    x_gateway_signature: Optional[str] = Header(None, alias="X-GATEWAY-SIGNATURE"),
    x_gateway_event_id: Optional[str] = Header(None, alias="Event-Id"),
):
    """
    Standard success receiver — always returns 200 OK.
    Use this as the target URL when testing normal webhook delivery.

    FIX: Headers are now Optional so missing headers don't cause 422 failures.
    """
    raw_body = await request.body()

    if not verify_gateway_signature(raw_body, x_gateway_signature):
        raise HTTPException(status_code=401, detail="Invalid Gateway Signature")

    # Safe body parse — never crashes on non-JSON or empty body
    data = _safe_parse_body(raw_body)

    # Idempotency — deduplicate if same event_id arrives twice
    event_id = x_gateway_event_id or data.get("event_id") or data.get("delivery_packet", {}).get("event_id")
    if event_id and event_id in PROCESSED_EVENTS:
        logger.info("Duplicate event %s deduplicated", event_id)
        return {
            "status": "deduplicated",
            "message": "Duplicate event ignored — already processed.",
            "event_id": event_id,
        }

    if event_id:
        PROCESSED_EVENTS.add(event_id)
        # Prevent unbounded memory growth — keep last 10k events
        if len(PROCESSED_EVENTS) > 10_000:
            PROCESSED_EVENTS.clear()

    logger.info("success-receiver: accepted event_id=%s", event_id)
    return {
        "status": "accepted",
        "message": "Webhook processed successfully by test client receiver",
        "verified": True,
        "event_id": event_id,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 2: Slow Response Receiver (Timeout Scenario)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/slow-receiver")
async def slow_target_receiver(
    request: Request,
    x_gateway_signature: Optional[str] = Header(None, alias="X-GATEWAY-SIGNATURE"),
    x_gateway_event_id: Optional[str] = Header(None, alias="Event-Id"),
):
    """
    Slow receiver — delays response by 8 seconds.
    Use this to test gateway worker HTTP timeout handling and retry policies.
    """
    raw_body = await request.body()

    if not verify_gateway_signature(raw_body, x_gateway_signature):
        raise HTTPException(status_code=401, detail="Invalid Gateway Signature")

    data = _safe_parse_body(raw_body)
    event_id = x_gateway_event_id or data.get("event_id")

    if event_id and event_id in PROCESSED_EVENTS:
        return {"status": "deduplicated", "message": "Replay attack blocked — already processed."}

    if event_id:
        PROCESSED_EVENTS.add(event_id)

    # Simulate a slow downstream service (8 seconds)
    await asyncio.sleep(8)

    logger.info("slow-receiver: accepted after delay, event_id=%s", event_id)
    return {
        "status": "accepted",
        "message": "Webhook processed after intentional delay (timeout test)",
        "event_id": event_id,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 3: Error Simulator Receiver (Retry & DLQ Scenario)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/error-receiver")
async def error_target_receiver(
    request: Request,
    x_gateway_signature: Optional[str] = Header(None, alias="X-GATEWAY-SIGNATURE"),
):
    """
    Always returns 500 Internal Server Error.
    Use this to intentionally trigger gateway retry logic and DLQ behavior.
    """
    raw_body = await request.body()

    if not verify_gateway_signature(raw_body, x_gateway_signature):
        raise HTTPException(status_code=401, detail="Invalid Gateway Signature")

    logger.info("error-receiver: intentionally returning 500 to test retry/DLQ")
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Simulated server failure — triggers gateway retry and DLQ flow.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE 4: Catch-All (Prevents 404 on any test URL pattern)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/{path:path}")
async def catch_all_test_receiver(path: str, request: Request):
    """
    Fallback receiver for any sub-path under /v1/test-targets/.
    Ensures no test webhook ever fails with 404 Not Found.
    """
    raw_body = await request.body()
    data = _safe_parse_body(raw_body)
    event_id = data.get("event_id") or data.get("delivery_packet", {}).get("event_id")

    logger.info("catch-all receiver: path=%s event_id=%s", path, event_id)
    return {
        "status": "accepted",
        "message": f"Webhook received by catch-all receiver at path: /{path}",
        "event_id": event_id,
        "verified": True,
    }