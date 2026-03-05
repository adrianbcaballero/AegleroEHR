
#Tracks request counts per IP address to prevent brute-force login attempts.
from datetime import datetime, timezone
import threading


class RateLimiter:
    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._attempts: dict[str, list[datetime]] = {}
        self._lock = threading.Lock()

    def is_rate_limited(self, key: str) -> bool:
        #Returns true if the key has exceeded max_requests within the window. records the current attempt.
        now = datetime.now(timezone.utc)
        cutoff = now.timestamp() - self.window_seconds

        with self._lock:
            if key not in self._attempts:
                self._attempts[key] = []

            #Remove expired attempts
            self._attempts[key] = [
                t for t in self._attempts[key]
                if t.timestamp() > cutoff
            ]

            if len(self._attempts[key]) >= self.max_requests:
                return True

            # Record this attempt
            self._attempts[key].append(now)
            return False

    def remaining(self, key: str) -> int:
        #Returns how many requests are left in the current time period
        now = datetime.now(timezone.utc)
        cutoff = now.timestamp() - self.window_seconds

        with self._lock:
            attempts = self._attempts.get(key, [])
            valid = [t for t in attempts if t.timestamp() > cutoff]
            return max(0, self.max_requests - len(valid))


#login attempts is being set to max 5 per minute per IP
login_limiter = RateLimiter(max_requests=5, window_seconds=60)