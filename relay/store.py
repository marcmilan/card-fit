"""
In-memory store for scheduled digests.

Intentionally simple — no database, no persistence across restarts.
Records live only until sent, then are deleted. Nothing is logged.

For production scale, swap this for a Redis store or a minimal DB
with TTL-based expiry — the interface stays the same.
"""

import threading
from datetime import datetime, timezone
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class ScheduledMessage:
    token: str
    phone: str
    message: str
    send_at: datetime
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class MessageStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._messages: dict[str, ScheduledMessage] = {}

    def add(self, msg: ScheduledMessage) -> None:
        with self._lock:
            self._messages[msg.token] = msg

    def get(self, token: str) -> Optional[ScheduledMessage]:
        with self._lock:
            return self._messages.get(token)

    def delete(self, token: str) -> None:
        with self._lock:
            self._messages.pop(token, None)

    def due_now(self) -> list[ScheduledMessage]:
        """Return all messages whose send_at is in the past."""
        now = datetime.now(timezone.utc)
        with self._lock:
            return [m for m in self._messages.values() if m.send_at <= now]

    def cancel_by_token(self, token: str) -> bool:
        """Cancel a pending message. Returns True if it existed."""
        with self._lock:
            if token in self._messages:
                del self._messages[token]
                return True
            return False


# Module-level singleton
store = MessageStore()
