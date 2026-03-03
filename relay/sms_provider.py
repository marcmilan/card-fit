"""
SMS provider abstraction — swap Twilio for any other provider by
implementing send_sms() here without touching anything upstream.
"""

from twilio.rest import Client
from config import settings


def send_sms(phone: str, message: str) -> bool:
    """
    Send an SMS message. Returns True on success, False on failure.
    Raises on configuration errors.
    """
    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    client.messages.create(
        body=message,
        from_=settings.twilio_from_number,
        to=phone,
    )
    return True
