from flask import Blueprint, request, g
from sqlalchemy import func

from auth_middleware import require_auth
from extensions import db
from models import Role, RolePermission, User, ALL_PERMISSIONS
from services.audit_logger import log_access
from services.helpers import client_ip, tenant_query

roles_bp = Blueprint("roles", __name__, url_prefix="/api/roles")


def _serialize_role(r: Role, user_count: int = 0):
    return {
        "id": r.id,
        "name": r.name,
        "displayName": r.display_name,
        "isSystemDefault": r.is_system_default,
        "permissions": r.permission_list,
        "userCount": user_count,
    }


@roles_bp.get("")
@require_auth(permission="roles.manage")
def list_roles():
    """GET /api/roles — list all roles for the tenant with user counts."""
    roles = tenant_query(Role).order_by(Role.is_system_default.desc(), Role.name.asc()).all()

    role_ids = [r.id for r in roles]
    counts = dict(
        db.session.query(User.role_id, func.count(User.id))
        .filter(User.role_id.in_(role_ids))
        .group_by(User.role_id)
        .all()
    ) if role_ids else {}

    return [_serialize_role(r, counts.get(r.id, 0)) for r in roles], 200


@roles_bp.get("/picker")
@require_auth(permission="users.manage")
def list_roles_picker():
    """GET /api/roles/picker — minimal role list for user create/edit forms."""
    roles = tenant_query(Role).order_by(Role.is_system_default.desc(), Role.name.asc()).all()
    return [{"id": r.id, "name": r.name, "displayName": r.display_name} for r in roles], 200


@roles_bp.get("/permissions")
@require_auth(permission="roles.manage")
def list_permissions():
    """GET /api/roles/permissions — return the canonical permission list."""
    return {"permissions": ALL_PERMISSIONS}, 200


@roles_bp.post("")
@require_auth(permission="roles.manage")
def create_role():
    """
    POST /api/roles
    Body: { "name": "counselor", "displayName": "Licensed Counselor", "permissions": [...] }
    """
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip().lower().replace(" ", "_")
    display_name = (data.get("displayName") or "").strip()
    permissions = data.get("permissions", [])

    if not name:
        return {"error": "name is required"}, 400
    if not display_name:
        return {"error": "displayName is required"}, 400
    if not isinstance(permissions, list):
        return {"error": "permissions must be a list"}, 400

    invalid = [p for p in permissions if p not in ALL_PERMISSIONS]
    if invalid:
        return {"error": f"invalid permissions: {invalid}"}, 400

    existing = tenant_query(Role).filter_by(name=name).first()
    if existing:
        log_access(g.user.id, "ROLE_CREATE", "roles", "FAILED", ip,
                   description=f"Role creation failed — name '{name}' already exists")
        return {"error": "a role with this name already exists"}, 409

    role = Role(
        tenant_id=g.tenant_id,
        name=name,
        display_name=display_name,
        is_system_default=False,
    )
    db.session.add(role)
    db.session.flush()

    for p in permissions:
        db.session.add(RolePermission(role_id=role.id, permission=p))

    db.session.commit()
    log_access(g.user.id, "ROLE_CREATE", f"role/{role.id}", "SUCCESS", ip,
               description=f"Created role '{role.display_name}' ({role.name}) with {len(permissions)} permissions")
    return _serialize_role(role), 201


@roles_bp.put("/<int:role_id>")
@require_auth(permission="roles.manage")
def update_role(role_id):
    """
    PUT /api/roles/<id>
    Body: { "displayName": "...", "permissions": [...] }
    System roles: display name is editable, name slug is locked.
    """
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    role = tenant_query(Role).filter_by(id=role_id).first()
    if not role:
        log_access(g.user.id, "ROLE_UPDATE", f"role/{role_id}", "FAILED", ip,
                   description=f"Role #{role_id} not found")
        return {"error": "role not found"}, 404

    changes = []

    if "displayName" in data:
        new_display = (data["displayName"] or "").strip()
        if not new_display:
            return {"error": "displayName cannot be empty"}, 400
        changes.append(f"displayName → '{new_display}'")
        role.display_name = new_display

    if "permissions" in data:
        permissions = data["permissions"]
        if not isinstance(permissions, list):
            return {"error": "permissions must be a list"}, 400
        invalid = [p for p in permissions if p not in ALL_PERMISSIONS]
        if invalid:
            return {"error": f"invalid permissions: {invalid}"}, 400

        # Replace all permissions
        RolePermission.query.filter_by(role_id=role.id).delete()
        for p in permissions:
            db.session.add(RolePermission(role_id=role.id, permission=p))
        changes.append(f"permissions updated ({len(permissions)} total)")

    if not changes:
        return {"error": "no fields to update"}, 400

    db.session.commit()
    log_access(g.user.id, "ROLE_UPDATE", f"role/{role.id}", "SUCCESS", ip,
               description=f"Updated role '{role.display_name}': {', '.join(changes)}")
    return _serialize_role(role), 200


@roles_bp.delete("/<int:role_id>")
@require_auth(permission="roles.manage")
def delete_role(role_id):
    """DELETE /api/roles/<id> — only non-system roles with no users assigned."""
    ip = client_ip()

    role = tenant_query(Role).filter_by(id=role_id).first()
    if not role:
        return {"error": "role not found"}, 404

    if role.is_system_default:
        log_access(g.user.id, "ROLE_DELETE", f"role/{role_id}", "FAILED", ip,
                   description=f"Attempted to delete system role '{role.name}'")
        return {"error": "cannot delete system default roles"}, 400

    user_count = User.query.filter_by(role_id=role.id, tenant_id=g.tenant_id).count()
    if user_count > 0:
        log_access(g.user.id, "ROLE_DELETE", f"role/{role_id}", "FAILED", ip,
                   description=f"Attempted to delete role '{role.name}' with {user_count} assigned user(s)")
        return {"error": f"Cannot delete — {user_count} user(s) are assigned to this role. Reassign them first."}, 409

    name = role.display_name
    db.session.delete(role)
    db.session.commit()
    log_access(g.user.id, "ROLE_DELETE", f"role/{role_id}", "SUCCESS", ip,
               description=f"Deleted role '{name}'")
    return {"ok": True}, 200
