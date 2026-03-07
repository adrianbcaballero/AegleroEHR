"""
Shared helper utilities used across route files.
Created to help eliminate duplication
"""

import os
from datetime import date
from flask import request, g
from models import Patient, User

# Hosts that indicate local development — fall back to DEV_TENANT_SLUG env var
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "backend"}


def get_slug_from_host() -> str | None:
    """
    Extracts the tenant slug from the Host header.

    Production:   sunrise-detox.aeglero.com  →  "sunrise-detox"
    Local/Docker: localhost / 127.0.0.1      →  DEV_TENANT_SLUG env var
    """
    host = request.headers.get("Host", "").split(":")[0]  # strip port

    if host in _LOCAL_HOSTS:
        return os.getenv("DEV_TENANT_SLUG") or None

    parts = host.split(".")
    if len(parts) >= 3:
        return parts[0]

    # Catch-all: any unrecognised host pattern also falls back to env var
    return os.getenv("DEV_TENANT_SLUG") or None


def client_ip() -> str:
    """
    Extracts the real client IP address.
    Checks X-Forwarded-For first (for requests behind a reverse proxy like ALB/nginx),
    then falls back to the direct remote address.
    """
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.remote_addr


def parse_date_iso(value) -> date | None | str:
    """
    Parses a YYYY-MM-DD string into a date object.
    Returns None for empty/None input, or the string "INVALID" if parsing fails.
    """
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return "INVALID"


def get_patient_by_id_or_code(patient_id: str) -> Patient | None:
    """
    Looks up a patient by either numeric DB id or patient_code string (e.g. 'PT-001').
    Tries numeric first, then falls back to code lookup.
    Always scoped to the current tenant.
    """
    tid = getattr(g, "tenant_id", None)
    p = None
    if str(patient_id).isdigit():
        p = Patient.query.filter_by(id=int(patient_id), tenant_id=tid).first()
    if not p:
        p = Patient.query.filter_by(patient_code=patient_id, tenant_id=tid).first()
    return p


def check_patient_access(patient: Patient) -> bool:
    """
    Scoping check: users without patients.view_all can only access their assigned patients.
    """
    if not g.user.has_permission("patients.view_all") and patient.assigned_provider_id != g.user.id:
        return False
    return True


def provider_display_name(provider_id: int) -> str | None:
    """
    Returns a display-friendly name for a provider (full_name or username).
    """
    if not provider_id:
        return None
    u = User.query.get(provider_id)
    if not u:
        return None
    return u.full_name or u.username


def tenant_query(model):
    """
    Returns a base query scoped to the current tenant.
    Every data query should start with this instead of Model.query
    to enforce tenant isolation.
    """
    return model.query.filter(model.tenant_id == g.tenant_id)