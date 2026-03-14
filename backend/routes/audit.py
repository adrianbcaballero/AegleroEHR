# Used for audit logs
from datetime import datetime, timezone, date, timedelta
from flask import Blueprint, request, g

from auth_middleware import require_auth
from models import AuditLog, UserSession, User
from services.audit_logger import log_access, _compute_hash
from extensions import db
from services.helpers import client_ip, tenant_query

audit_bp = Blueprint("audit", __name__, url_prefix="/api/audit")



def _parse_date(value):
    """
    Accepts YYYY-MM-DD; returns datetime range start in UTC.
    """
    if not value:
        return None
    try:
        d = date.fromisoformat(value)
        return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    except ValueError:
        return "INVALID"



@audit_bp.get("/logs")
@require_auth(permission="audit.view")
def get_audit_logs():

    user_id = request.args.get("user_id")
    action = (request.args.get("action") or "").strip()
    status = (request.args.get("status") or "").strip()
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    limit = request.args.get("limit", "200")
    before_id = request.args.get("before_id")
    resource_contains = (request.args.get("resource_contains") or "").strip()

    try:
        limit = min(int(limit), 500)
    except ValueError:
        limit = 200

    q = db.session.query(AuditLog, User.username).outerjoin(User, User.id == AuditLog.user_id).filter(AuditLog.tenant_id == g.tenant_id)

    if user_id:
        try:
            q = q.filter(AuditLog.user_id == int(user_id))
        except ValueError:
            return {"error": "user_id must be an integer"}, 400
        

    if action:
        q = q.filter(AuditLog.action == action)

    if status:
        q = q.filter(AuditLog.status == status)

    if resource_contains:
        q = q.filter(AuditLog.resource.ilike(f"%{resource_contains}%"))

    dt_from = _parse_date(date_from)
    dt_to = _parse_date(date_to)

    if dt_from == "INVALID" or dt_to == "INVALID":
        return {"error": "date_from/date_to must be YYYY-MM-DD"}, 400

    if dt_from:
        q = q.filter(AuditLog.timestamp >= dt_from)

    if dt_to:
        q = q.filter(AuditLog.timestamp < (dt_to + timedelta(days=1)))

    total = q.count()
    if before_id:
        try:
            q = q.filter(AuditLog.id < int(before_id))
        except ValueError:
            return {"error": "before_id must be an integer"}, 400

    rows = (
        q.order_by(AuditLog.id.desc())
         .limit(limit)
         .all()
    )

    items = []
    for log, username in rows:
        items.append({
            "id": log.id,
            "timestamp": log.timestamp.isoformat(),
            "userId": log.user_id,
            "username": username,
            "action": log.action,
            "resource": log.resource,
            "ipAddress": log.ip_address,
            "status": log.status,
            "description": log.description,
            "entryHash": log.entry_hash,
        })
    next_before_id = items[-1]["id"] if items else None
    
    return {"total": total, "nextBeforeId": next_before_id, "items": items}, 200



@audit_bp.get("/stats")
@require_auth(permission="audit.view")
def get_audit_stats():
    """
    GET /api/audit/stats
    Returns:
      total_logins_today
      failed_logins_today
      not_authenticated_today (401)
      unauthorized_attempts_today (403)
      server_errors_today (500)
      active_sessions
    """

    now = datetime.now(timezone.utc)
    start_today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    start_tomorrow = start_today + timedelta(days=1)

    def _count(action, status=None):
        q = db.session.query(AuditLog).filter(
            AuditLog.tenant_id == g.tenant_id,
            AuditLog.action == action,
            AuditLog.timestamp >= start_today,
            AuditLog.timestamp < start_tomorrow,
        )
        if status:
            q = q.filter(AuditLog.status == status)
        return q.count()

    total_logins_today = _count("LOGIN", "SUCCESS")
    failed_logins_today = _count("LOGIN", "FAILED")

    not_authenticated_today = _count("ACCESS_401", "FAILED")
    unauthorized_attempts_today = _count("ACCESS_403", "FAILED")
    server_errors_today = _count("ACCESS_500", "FAILED")

    active_sessions = tenant_query(UserSession).count()

    return {
        "total_logins_today": total_logins_today,
        "failed_logins_today": failed_logins_today,
        "not_authenticated_today": not_authenticated_today,
        "unauthorized_attempts_today": unauthorized_attempts_today,
        "server_errors_today": server_errors_today,
        "active_sessions": active_sessions,
    }, 200


@audit_bp.get("/export")
@require_auth(permission="audit.view")
def export_audit_logs():
    """
    GET /api/audit/export?status=...&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    Returns CSV file download
    """
    import csv
    import io
    from flask import Response

    ip = client_ip()

    status = (request.args.get("status") or "").strip()
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    user_id = request.args.get("user_id")

    q = db.session.query(AuditLog, User.username).outerjoin(User, User.id == AuditLog.user_id).filter(AuditLog.tenant_id == g.tenant_id)

    if user_id:
        try:
            q = q.filter(AuditLog.user_id == int(user_id))
        except ValueError:
            pass

    if status:
        q = q.filter(AuditLog.status == status)

    dt_from = _parse_date(date_from)
    dt_to = _parse_date(date_to)

    if dt_from == "INVALID" or dt_to == "INVALID":
        log_access(g.user.id, "AUDIT_EXPORT", "audit/export", "FAILED", ip, description="Audit export failed — invalid date format")
        return {"error": "date_from/date_to must be YYYY-MM-DD"}, 400

    if dt_from:
        q = q.filter(AuditLog.timestamp >= dt_from)
    if dt_to:
        q = q.filter(AuditLog.timestamp < (dt_to + timedelta(days=1)))

    rows = q.order_by(AuditLog.id.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Timestamp", "User ID", "Username", "Action", "Resource", "IP Address", "Status", "Description", "Prev Hash", "Entry Hash"])

    for log, username in rows:
        writer.writerow([
            log.id,
            log.timestamp.isoformat() if log.timestamp else "",
            log.user_id or "",
            username or "",
            log.action,
            log.resource,
            log.ip_address or "",
            log.status,
            log.description or "",
            log.prev_hash or "",
            log.entry_hash or "",
        ])

    csv_data = output.getvalue()
    output.close()

    filename = f"audit_logs_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"

    filters = []
    if status: filters.append(f"status={status}")
    if date_from: filters.append(f"from={date_from}")
    if date_to: filters.append(f"to={date_to}")
    if user_id: filters.append(f"user_id={user_id}")
    filter_desc = f" with filters: {', '.join(filters)}" if filters else " (no filters)"
    log_access(g.user.id, "AUDIT_EXPORT", "audit/export", "SUCCESS", ip, description=f"Exported {len(rows)} audit log entries to CSV{filter_desc}")
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@audit_bp.get("/verify")
@require_auth(permission="audit.view")
def verify_audit_chain():
    """
    GET /api/audit/verify
    Walks the full hash chain for this tenant and reports whether any entries
    have been tampered with.  ONC §170.315(d)(2) tamper-detection.
    """
    ip = client_ip()

    rows = (
        db.session.query(AuditLog)
        .filter(AuditLog.tenant_id == g.tenant_id)
        .order_by(AuditLog.id.asc())
        .all()
    )

    total = len(rows)
    broken = []
    prev_hash = None

    for row in rows:
        if row.entry_hash is None:
            prev_hash = None
            continue

        expected = _compute_hash(
            row.timestamp, row.tenant_id, row.user_id,
            row.action, row.resource, row.status,
            row.ip_address, row.description, prev_hash,
        )

        if row.entry_hash != expected or row.prev_hash != prev_hash:
            broken.append({
                "id": row.id,
                "timestamp": row.timestamp.isoformat(),
                "action": row.action,
                "expected_hash": expected,
                "actual_hash": row.entry_hash,
            })

        prev_hash = row.entry_hash

    intact = len(broken) == 0
    status_word = "INTACT" if intact else "TAMPERED"

    log_access(g.user.id, "AUDIT_VERIFY", "audit/verify", "SUCCESS", ip,
               description=f"Hash chain verification: {status_word} — {total} entries checked, {len(broken)} broken")

    return {
        "intact": intact,
        "total_entries": total,
        "broken_entries": len(broken),
        "details": broken[:50],  # cap to prevent huge responses
    }, 200