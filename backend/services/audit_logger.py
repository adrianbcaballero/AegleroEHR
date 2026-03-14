# Audit Logging utility — tamper-evident hash chain (ONC §170.315(d)(2))
import hashlib
from datetime import datetime, timezone
from flask import g
from extensions import db
from models import AuditLog


def _compute_hash(timestamp, tenant_id, user_id, action, resource, status, ip_address, description, prev_hash):
    """
    SHA-256 hash of the entry's content fields concatenated with the previous
    entry's hash.  This creates a hash chain: altering any earlier row
    invalidates every subsequent hash, making tampering detectable.
    """
    payload = "|".join([
        timestamp.isoformat() if timestamp else "",
        str(tenant_id or ""),
        str(user_id or ""),
        action or "",
        resource or "",
        status or "",
        ip_address or "",
        description or "",
        prev_hash or "GENESIS",
    ])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def log_access(user_id, action, resource, status, ip_address=None, description=None, tenant_id=None):
    # Capture tenant context if available (may not exist for unauthenticated requests)
    if tenant_id is None:
        tenant_id = getattr(g, "tenant_id", None)

    ts = datetime.now(timezone.utc)

    # Get the hash of the most recent entry for this tenant (chain is per-tenant)
    prev = (
        db.session.query(AuditLog.entry_hash)
        .filter(AuditLog.tenant_id == tenant_id)
        .order_by(AuditLog.id.desc())
        .first()
    )
    prev_hash = prev[0] if prev and prev[0] else None

    entry_hash = _compute_hash(ts, tenant_id, user_id, action, resource, status, ip_address, description, prev_hash)

    entry = AuditLog(
        tenant_id=tenant_id,
        timestamp=ts,
        user_id=user_id,
        action=action,
        resource=resource,
        status=status,
        ip_address=ip_address,
        description=description,
        prev_hash=prev_hash,
        entry_hash=entry_hash,
    )
    db.session.add(entry)
    db.session.commit()
