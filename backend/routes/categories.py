from flask import Blueprint, request, g

from auth_middleware import require_auth
from extensions import db
from models import Tenant
from services.audit_logger import log_access
from services.helpers import client_ip
from sqlalchemy.orm.attributes import flag_modified

categories_bp = Blueprint("categories", __name__, url_prefix="/api")

DEFAULT_CATEGORIES = ["assessment", "clinical", "consent", "discharge", "flowsheet", "intake", "insurance", "treatment"]


@categories_bp.get("/tenant")
@require_auth()
def get_tenant():
    tenant = Tenant.query.get(g.tenant_id)
    if not tenant:
        return {"error": "tenant not found"}, 404
    return {
        "name": tenant.name,
        "npi": tenant.npi or "",
        "phone": tenant.phone or "",
        "email": tenant.email or "",
        "address": tenant.address or "",
    }, 200


@categories_bp.get("/categories")
@require_auth()
def get_categories():
    tenant = Tenant.query.get(g.tenant_id)
    saved_order = (tenant.category_order or []) if tenant else []

    # Merge: saved order first, then any defaults not already present
    result = list(saved_order)
    for d in DEFAULT_CATEGORIES:
        if d not in result:
            result.append(d)

    return {
        "categories": result,
        "defaultCategories": DEFAULT_CATEGORIES,
    }, 200


@categories_bp.put("/categories")
@require_auth(roles=["admin", "psychiatrist"])
def update_categories():
    ip = client_ip()
    data = request.get_json(silent=True) or {}
    categories = data.get("categories", [])

    if not isinstance(categories, list):
        return {"error": "categories must be a list"}, 400

    if not all(isinstance(c, str) and c.strip() for c in categories):
        return {"error": "All categories must be non-empty strings"}, 400

    # Ensure all defaults are present
    for d in DEFAULT_CATEGORIES:
        if d not in categories:
            return {"error": f"Default category '{d}' cannot be removed"}, 400

    # Deduplicate preserving order, normalize to lowercase
    seen: set[str] = set()
    clean: list[str] = []
    for c in categories:
        c = c.strip().lower()
        if c not in seen:
            seen.add(c)
            clean.append(c)

    tenant = Tenant.query.get(g.tenant_id)
    if not tenant:
        return {"error": "tenant not found"}, 404

    tenant.category_order = clean
    flag_modified(tenant, "category_order")
    db.session.commit()

    log_access(
        g.user.id, "CATEGORIES_UPDATE", "categories", "SUCCESS", ip,
        description=f"Updated category order ({len(clean)} categories)"
    )

    return {
        "categories": clean,
        "defaultCategories": DEFAULT_CATEGORIES,
    }, 200
