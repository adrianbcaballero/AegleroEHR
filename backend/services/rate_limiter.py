"""
Database-backed login rate limiter.
Tracks request counts per IP address to prevent brute-force login attempts.
Stored in the database so the limit is enforced across all gunicorn workers.
"""
from datetime import datetime, timedelta, timezone

from extensions import db
from models import LoginAttempt

# Login attempts: max 5 per 60 seconds per IP
MAX_REQUESTS = 5
WINDOW_SECONDS = 60


def is_rate_limited(ip: str) -> bool:
    """
    Returns True if the IP has exceeded MAX_REQUESTS within the window.
    Records the current attempt and prunes expired rows for this IP.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=WINDOW_SECONDS)

    # Prune expired attempts for this IP
    LoginAttempt.query.filter(
        LoginAttempt.ip_address == ip,
        LoginAttempt.attempted_at < cutoff,
    ).delete()

    # Count recent attempts
    count = LoginAttempt.query.filter(
        LoginAttempt.ip_address == ip,
        LoginAttempt.attempted_at >= cutoff,
    ).count()

    if count >= MAX_REQUESTS:
        db.session.commit()
        return True

    # Record this attempt
    db.session.add(LoginAttempt(ip_address=ip, attempted_at=now))
    db.session.commit()
    return False
