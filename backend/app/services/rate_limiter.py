"""
Rate Limiter — Redis Sliding Window Counter

Strategy: Sliding window using Redis ZADD + ZREMRANGEBYSCORE (sorted sets).
This is more accurate than fixed-window and cheaper than token bucket for this use case.

Limit Tiers (per entity, per window):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Tier                  | Key Scope            | Limit   | Window
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Inbound webhooks      | per project_id       | 500/min | 60s
 Auth login            | per IP               | 10/min  | 60s
 Auth register         | per IP               | 5/min   | 60s
 REST API (general)    | per company_id       | 300/min | 60s
 Dashboard stats       | per company_id       | 60/min  | 60s
 DLQ replay/discard    | per company_id       | 30/min  | 60s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Keys are stored as:  rl:{tier}:{entity}
TTL is set to 2× the window to allow natural expiry.
"""

import time
import logging
from typing import Optional
from fastapi import Request, HTTPException, status
from app.services.redis_client import get_redis_client

logger = logging.getLogger("app.ratelimiter")


async def _sliding_window_check(
    key: str,
    limit: int,
    window_seconds: int,
    request_id: Optional[str] = None,
) -> dict:
    """
    Core sliding window rate limiter using Redis sorted sets.

    Returns a dict with:
        allowed     (bool)   — whether the request is permitted
        remaining   (int)    — requests remaining in this window
        retry_after (float)  — seconds until a slot is available (0 if allowed)
        limit       (int)    — the configured limit for this tier
        reset_at    (float)  — unix timestamp when the window resets

    Uses a Lua script for atomicity: the ZADD + ZREMRANGEBYSCORE + ZCARD
    sequence is executed as a single Redis transaction to prevent race conditions.
    """
    now_ms = int(time.time() * 1000)
    window_ms = window_seconds * 1000
    window_start_ms = now_ms - window_ms

    lua_script = """
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local window_start_ms = tonumber(ARGV[2])
local window_ms = tonumber(ARGV[3])
local req_id = ARGV[4]
local limit = tonumber(ARGV[5])

-- Remove expired entries from the sorted set
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start_ms)

-- Count current requests in the window
local count = redis.call('ZCARD', key)

if count < limit then
    -- Allow: add this request timestamp to the set
    redis.call('ZADD', key, now_ms, req_id)
    redis.call('PEXPIRE', key, window_ms * 2)
    return {1, limit - count - 1, 0}
else
    -- Deny: find the oldest entry to compute retry_after
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after_ms = 0
    if oldest and oldest[2] then
        retry_after_ms = tonumber(oldest[2]) + window_ms - now_ms
        if retry_after_ms < 0 then retry_after_ms = 0 end
    end
    return {0, 0, retry_after_ms}
end
"""

    redis = None
    try:
        redis = await get_redis_client()
        unique_member = request_id or f"{now_ms}"
        result = await redis.eval(
            lua_script,
            1,  # number of keys
            key,
            now_ms,
            window_start_ms,
            window_ms,
            unique_member,
            limit,
        )
        allowed = bool(result[0])
        remaining = int(result[1])
        retry_after_ms = float(result[2])

        return {
            "allowed": allowed,
            "remaining": remaining,
            "retry_after": retry_after_ms / 1000.0,
            "limit": limit,
            "reset_at": (now_ms + window_ms) / 1000.0,
        }
    except Exception as exc:
        # On Redis failure: FAIL OPEN (allow the request) to avoid downtime
        # but log the issue for monitoring
        logger.warning("Rate limiter Redis error (failing open): %s", exc)
        return {
            "allowed": True,
            "remaining": limit,
            "retry_after": 0.0,
            "limit": limit,
            "reset_at": time.time() + window_seconds,
        }
    finally:
        if redis:
            await redis.aclose()


def _add_rate_limit_headers(response_headers: dict, info: dict) -> None:
    """Add standard RateLimit-* headers to the response (RFC 6585 / IETF draft)."""
    response_headers["X-RateLimit-Limit"] = str(info["limit"])
    response_headers["X-RateLimit-Remaining"] = str(max(0, info["remaining"]))
    response_headers["X-RateLimit-Reset"] = str(int(info["reset_at"]))
    if not info["allowed"]:
        response_headers["Retry-After"] = str(int(info["retry_after"]) + 1)


def _get_client_ip(request: Request) -> str:
    """Extract the real client IP, respecting standard proxy headers."""
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ─────────────────────────── FastAPI Dependencies ────────────────────────────

async def rate_limit_auth_login(request: Request):
    """
    10 login attempts per IP per minute.
    Protects against brute-force credential stuffing.
    """
    ip = _get_client_ip(request)
    key = f"rl:auth_login:{ip}"
    info = await _sliding_window_check(key, limit=10, window_seconds=60)
    _add_rate_limit_headers(request.state.__dict__.setdefault("rl_headers", {}), info)

    if not info["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {int(info['retry_after']) + 1}s.",
            headers={
                "Retry-After": str(int(info["retry_after"]) + 1),
                "X-RateLimit-Limit": "10",
                "X-RateLimit-Remaining": "0",
            },
        )


async def rate_limit_auth_register(request: Request):
    """
    5 registration attempts per IP per minute.
    Prevents automated account creation / abuse.
    """
    ip = _get_client_ip(request)
    key = f"rl:auth_register:{ip}"
    info = await _sliding_window_check(key, limit=5, window_seconds=60)

    if not info["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many registration attempts. Try again in {int(info['retry_after']) + 1}s.",
            headers={
                "Retry-After": str(int(info["retry_after"]) + 1),
                "X-RateLimit-Limit": "5",
                "X-RateLimit-Remaining": "0",
            },
        )


async def rate_limit_gateway(request: Request):
    """
    500 inbound webhook events per project per minute.
    Applied at the /v1/gateway endpoint.
    The project_id is read from the decrypted API key embedded in X-API-KEY header.
    Falls back to IP-based limiting if the key cannot be parsed.
    """
    from  app.utils.security import WebhookSecurity

    client_api_key = request.headers.get("X-API-KEY")
    try:
        project_id, company_id, _ = WebhookSecurity.decode_and_parse_api_key(client_api_key)
        key = f"rl:gateway:project:{project_id}"
    except Exception:
        ip = _get_client_ip(request)
        key = f"rl:gateway:ip:{ip}"

    info = await _sliding_window_check(key, limit=500, window_seconds=60)

    if not info["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Webhook rate limit exceeded (500/min per project). Retry in {int(info['retry_after']) + 1}s.",
            headers={
                "Retry-After": str(int(info["retry_after"]) + 1),
                "X-RateLimit-Limit": "500",
                "X-RateLimit-Remaining": "0",
            },
        )


async def rate_limit_api(request: Request):
    """
    300 API calls per company per minute (general REST endpoints).
    company_id extracted from JWT Bearer token.
    Falls back to IP if no token is present.
    """
    from  app.utils.security import JWTManager

    try:
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.removeprefix("Bearer ").strip()
        payload = JWTManager.decode_access_token(token) if token else None
        company_id = payload.get("sub") if payload else None
    except Exception:
        company_id = None

    if company_id:
        key = f"rl:api:company:{company_id}"
    else:
        ip = _get_client_ip(request)
        key = f"rl:api:ip:{ip}"

    info = await _sliding_window_check(key, limit=300, window_seconds=60)

    if not info["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"API rate limit exceeded (300/min). Retry in {int(info['retry_after']) + 1}s.",
            headers={
                "Retry-After": str(int(info["retry_after"]) + 1),
                "X-RateLimit-Limit": "300",
                "X-RateLimit-Remaining": "0",
            },
        )


async def rate_limit_dashboard(request: Request):
    """
    60 dashboard stat fetches per company per minute.
    Prevents aggressive polling that bypasses the WebSocket.
    """
    from  app.utils.security import JWTManager

    try:
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.removeprefix("Bearer ").strip()
        payload = JWTManager.decode_access_token(token) if token else None
        company_id = payload.get("sub") if payload else None
    except Exception:
        company_id = None

    key = f"rl:dashboard:company:{company_id}" if company_id else f"rl:dashboard:ip:{_get_client_ip(request)}"
    info = await _sliding_window_check(key, limit=60, window_seconds=60)

    if not info["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Dashboard stats rate limit exceeded (60/min). Use the WebSocket for real-time updates.",
            headers={
                "Retry-After": str(int(info["retry_after"]) + 1),
                "X-RateLimit-Limit": "60",
                "X-RateLimit-Remaining": "0",
            },
        )


async def rate_limit_dlq_actions(request: Request):
    """
    30 DLQ replay/discard operations per company per minute.
    DLQ mutations are expensive (AMQP reads + DB queries) — protect the infrastructure.
    """
    from  app.utils.security import JWTManager

    try:
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.removeprefix("Bearer ").strip()
        payload = JWTManager.decode_access_token(token) if token else None
        company_id = payload.get("sub") if payload else None
    except Exception:
        company_id = None

    key = f"rl:dlq:company:{company_id}" if company_id else f"rl:dlq:ip:{_get_client_ip(request)}"
    info = await _sliding_window_check(key, limit=30, window_seconds=60)

    if not info["allowed"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"DLQ action rate limit exceeded (30/min). Retry in {int(info['retry_after']) + 1}s.",
            headers={
                "Retry-After": str(int(info["retry_after"]) + 1),
                "X-RateLimit-Limit": "30",
                "X-RateLimit-Remaining": "0",
            },
        )
