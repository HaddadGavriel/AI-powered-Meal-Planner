import time
from collections import defaultdict, deque
from collections.abc import Callable
from threading import Lock

from app.errors import ApiError


class InMemoryRateLimiter:
    """Small, process-local fixed-window limiter with explicit lifecycle control."""

    def __init__(self, window_seconds: float = 60, clock: Callable[[], float] = time.monotonic):
        self.window_seconds = window_seconds
        self._clock = clock
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, maximum: int) -> None:
        now = self._clock()
        with self._lock:
            bucket = self._attempts[key]
            while bucket and bucket[0] < now - self.window_seconds:
                bucket.popleft()
            if len(bucket) >= maximum:
                raise ApiError(429, "RATE_LIMITED", "Too many requests. Try again later.")
            bucket.append(now)

    def reset(self) -> None:
        """Clear process state; used when an application/test lifecycle is torn down."""
        with self._lock:
            self._attempts.clear()


rate_limiter = InMemoryRateLimiter()
