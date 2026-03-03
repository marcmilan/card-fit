"""
Background scheduler — polls the in-memory store every minute
and fires due messages via the SMS provider.

Uses APScheduler (lightweight, no external dependencies beyond the package).
"""

import logging
from apscheduler.schedulers.background import BackgroundScheduler
from store import store
from sms_provider import send_sms

logger = logging.getLogger(__name__)


def _send_due_messages() -> None:
    due = store.due_now()
    for msg in due:
        try:
            send_sms(msg.phone, msg.message)
            logger.info("sent scheduled digest token=%s", msg.token[:8])
        except Exception as exc:
            logger.error("failed to send token=%s: %s", msg.token[:8], exc)
        finally:
            # Always delete after attempting — don't retry to avoid double-sends
            store.delete(msg.token)


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler()
    scheduler.add_job(_send_due_messages, "interval", minutes=1, id="send_due")
    scheduler.start()
    logger.info("scheduler started")
    return scheduler
