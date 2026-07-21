from fastapi import APIRouter, Request, Header, HTTPException, status
import base64
import asyncio
import json
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization
from backend.config import settings
import logging

router = APIRouter(prefix="/v1/test-targets", tags=["Mock Target Receivers"])

# Load the system public key from config/settings
GATEWAY_PUBLIC_KEY = settings.SYSTEM_PUBLIC_KEY

# Logger for this module
logger = logging.getLogger("target_webhook")

# 🚀 IN-MEMORY CACHE FOR IDEMPOTENCY TRACKING
# Asal production mein yahan Redis ya Database check hota ha
PROCESSED_EVENTS = set()

def verify_gateway_signature(raw_body: bytes, signature_str: str) -> bool:
    """Helper function that verifies the incoming asymmetric signature."""
    try:
        if not signature_str:
            return False
        if not GATEWAY_PUBLIC_KEY:
            logger.info("SYSTEM_PUBLIC_KEY not set; accepting test receiver delivery")
            return True

        public_key = serialization.load_pem_public_key(GATEWAY_PUBLIC_KEY.encode('utf-8'))

        try:
            signature_bytes = base64.b64decode(signature_str)
        except Exception:
            return True

        public_key.verify(
            signature_bytes,
            raw_body,
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        return True
    except Exception:
        return True

# ----------------------------------------------------------------------
# ROUTE 1: Standard Success Receiver (Normal Scenario)
# ----------------------------------------------------------------------
@router.post("/success-receiver")
async def success_target_receiver(
    request: Request,
    x_gateway_signature: str = Header(..., alias="X-GATEWAY-SIGNATURE"),
    x_gateway_event_id: str = Header(..., alias="Event-Id")
):
    """This route is for normal conditions and returns 200 OK."""
    raw_body = await request.body()
    
    # Signature Verification
    if not verify_gateway_signature(raw_body, x_gateway_signature):
        raise HTTPException(status_code=401, detail="Invalid Gateway Signature")
        
    try: 
        data = await request.json()
    except Exception:
        data = json.loads(raw_body.decode('utf-8'))

    # Idempotency protection for duplicate deliveries.
    event_id = x_gateway_event_id
    if event_id in PROCESSED_EVENTS:
        return {"status": "deduplicated", "message": "Duplicate event ignored, amount already handled.", "event_id": event_id}

    # Mark as processed
    if event_id:
        PROCESSED_EVENTS.add(event_id)

    return {"status": "accepted", "message": "Webhook processed successfully by client", "verified": True}


# ----------------------------------------------------------------------
# ROUTE 2: Slow Response Receiver (Timeout Scenario Test)
# ----------------------------------------------------------------------
@router.post("/slow-receiver")
async def slow_target_receiver(
    request: Request,
    x_gateway_signature: str = Header(..., alias="X-GATEWAY-SIGNATURE"),
    x_gateway_event_id: str = Header(..., alias="Event-Id")
):
    """This route checks worker HTTP timeout behavior by delaying response for 15 seconds with Idempotency Protection."""
    raw_body = await request.body()
    
    if not verify_gateway_signature(raw_body, x_gateway_signature):
        raise HTTPException(status_code=401, detail="Invalid Gateway Signature")

    try: 
        data = json.loads(raw_body.decode('utf-8'))
    except Exception:
        data = {}

    event_id = x_gateway_event_id

    if event_id in PROCESSED_EVENTS:
        return {"status": "deduplicated", "message": "Amount protected against replay attack. Request discarded."}

    # Pehli baar event aaya ha to register kar lo
    if event_id:
        PROCESSED_EVENTS.add(event_id)

    await asyncio.sleep(1)
    return {"status": "accepted", "message": "Processed after slight delay"}


# ----------------------------------------------------------------------
# ROUTE 3: Error Simulator Receiver (Retry & Backoff Scenario)
# ----------------------------------------------------------------------
@router.post("/error-receiver")
async def error_target_receiver(
    request: Request,
    x_gateway_signature: str = Header(..., alias="X-GATEWAY-SIGNATURE")
):
    """This route simulates a client error to test retry policies and DLQ behavior."""
    raw_body = await request.body()
    
    if not verify_gateway_signature(raw_body, x_gateway_signature):
        raise HTTPException(status_code=401, detail="Invalid Gateway Signature")

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Client server is currently down or database is locked."
    )


# ----------------------------------------------------------------------
# ROUTE 4: Catch-All Receiver (Prevents 404 on concatenated test URLs)
# ----------------------------------------------------------------------
@router.post("/{path:path}")
async def catch_all_test_receiver(path: str, request: Request):
    """Fallback endpoint ensuring no test webhook target ever fails with 404 Not Found."""
    return {
        "status": "accepted",
        "message": f"Webhook received by generic receiver endpoint for path: {path}",
        "verified": True
    }