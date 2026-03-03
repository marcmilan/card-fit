"""
card-fit SMS relay — FastAPI backend

Responsibilities:
  - Accept scheduled digest requests from the frontend (phone + message + send_at + token)
  - Store them transiently in memory until send_at
  - Fire them via the SMS provider at the right time
  - Delete immediately after sending — nothing is logged or persisted

Zero-knowledge guarantee:
  - The relay never stores card data, balances, or any structured financial information
  - It only sees the final composed SMS text (a string) and a phone number
  - Both are held only until the message is sent, then deleted
  - No analytics, no logging of message content or phone numbers

Security:
  - All requests must include a valid RELAY_SECRET in the Authorization header
  - CORS restricted to the configured frontend origin
"""

import logging
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

from config import settings
from store import store, ScheduledMessage
from scheduler import start_scheduler

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = start_scheduler()
    yield
    scheduler.shutdown(wait=False)


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="card-fit relay",
    description="Thin SMS relay for card-fit. Open source. See SECURITY.md.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,   # disable Swagger UI in production
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.allowed_origin] if settings.allowed_origin != "*" else ["*"],
    allow_methods=["POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


# ── Auth ──────────────────────────────────────────────────────────────────────

def verify_secret(request: Request) -> None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    token = auth.removeprefix("Bearer ").strip()
    # Constant-time comparison to prevent timing attacks
    if not secrets.compare_digest(token, settings.relay_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")


# ── Schemas ───────────────────────────────────────────────────────────────────

class ScheduleRequest(BaseModel):
    token: str          # single-use random UUID from client
    phone: str          # E.164 format
    message: str        # pre-composed SMS text
    send_at: datetime   # ISO 8601 with timezone

    @field_validator("phone")
    @classmethod
    def phone_must_be_e164(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith("+") or not v[1:].isdigit() or len(v) < 8:
            raise ValueError("phone must be in E.164 format (+15550000000)")
        return v

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("message cannot be empty")
        if len(v) > 1600:
            raise ValueError("message too long (max 1600 chars)")
        return v

    @field_validator("token")
    @classmethod
    def token_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("token cannot be empty")
        return v.strip()


class CancelRequest(BaseModel):
    token: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    """Health check — no auth required."""
    return {"status": "ok"}


@app.post("/schedule", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(verify_secret)])
def schedule_digest(body: ScheduleRequest) -> dict:
    """
    Schedule an SMS digest for future delivery.
    The client composes the message; the relay holds it until send_at then deletes it.
    """
    # Normalise timezone
    send_at = body.send_at
    if send_at.tzinfo is None:
        send_at = send_at.replace(tzinfo=timezone.utc)

    if send_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="send_at must be in the future",
        )

    # Overwrite any existing message for this token (client rescheduled)
    store.add(ScheduledMessage(
        token=body.token,
        phone=body.phone,
        message=body.message,
        send_at=send_at,
    ))

    logger.info("scheduled digest token=%s send_at=%s", body.token[:8], send_at.isoformat())
    return {"scheduled": True, "token": body.token}


@app.delete("/schedule/{token}", dependencies=[Depends(verify_secret)])
def cancel_digest(token: str) -> dict:
    """
    Cancel a pending scheduled digest (e.g. because the client rescheduled or payment was made).
    """
    cancelled = store.cancel_by_token(token)
    return {"cancelled": cancelled}


@app.post("/send", status_code=status.HTTP_200_OK, dependencies=[Depends(verify_secret)])
def send_now(body: ScheduleRequest) -> dict:
    """
    Send an SMS immediately (for urgency fallback and user-triggered digests).
    Does not go through the scheduler.
    """
    from sms_provider import send_sms
    try:
        send_sms(body.phone, body.message)
        logger.info("sent immediate digest token=%s", body.token[:8])
        return {"sent": True}
    except Exception as exc:
        logger.error("immediate send failed token=%s: %s", body.token[:8], exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="SMS send failed")
