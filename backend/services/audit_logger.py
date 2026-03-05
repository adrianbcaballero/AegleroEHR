# Audit Logging utility
from datetime import datetime, timezone
from flask import g
from extensions import db
from models import AuditLog

def log_access(user_id, action, resource, status, ip_address=None, description=None, tenant_id=None):
    # Capture tenant context if available (may not exist for unauthenticated requests)
    if tenant_id is None:
        tenant_id = getattr(g, "tenant_id", None)

    entry = AuditLog(
        tenant_id=tenant_id,
        timestamp=datetime.now(timezone.utc),
        user_id=user_id,
        action=action,
        resource=resource,
        status=status,
        ip_address=ip_address,
        description=description,
    )
    db.session.add(entry)
    db.session.commit()