"""
Smoke test suite for AegleroEMR API.
Runs against a live local stack (docker compose up).

Usage:
    pip install requests
    python backend/tests/smoke_test.py

Expects seed data (admin1 / Password123!) on DEV_TENANT_SLUG=aeglero-detox.
"""

import sys
import requests

BASE = "http://localhost:5000"
CREDS = {"username": "admin1", "password": "Password123!"}
LOW_PRIV_CREDS = {"username": "frontdesk1", "password": "Password123!"}

passed = 0
failed = 0
errors = []

# Shared sessions — login once, reuse across all tests (avoids rate limiter)
admin_session = requests.Session()
frontdesk_session = requests.Session()


def test(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print(f"  PASS  {name}")
    except AssertionError as e:
        failed += 1
        errors.append((name, str(e)))
        print(f"  FAIL  {name} — {e}")
    except Exception as e:
        failed += 1
        errors.append((name, str(e)))
        print(f"  ERROR {name} — {e}")


def setup():
    """Log in both sessions once before running tests."""
    r = admin_session.post(f"{BASE}/api/auth/login", json=CREDS)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["username"] == "admin1"
    print("  [setup] admin1 logged in")

    r = frontdesk_session.post(f"{BASE}/api/auth/login", json=LOW_PRIV_CREDS)
    assert r.status_code == 200, f"frontdesk login failed: {r.status_code} {r.text}"
    print("  [setup] frontdesk1 logged in")


# ── Auth ──────────────────────────────────────────────

def test_login_bad_password():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"username": "admin1", "password": "wrong"})
    assert r.status_code == 401, f"expected 401, got {r.status_code}"

def test_me_authenticated():
    r = admin_session.get(f"{BASE}/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "admin1"

def test_me_unauthenticated():
    s = requests.Session()
    r = s.get(f"{BASE}/api/auth/me")
    assert r.status_code == 401

def test_logout_and_relogin():
    """Log in fresh, logout, verify session is dead, then re-login to not break other tests."""
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=CREDS)
    assert r.status_code == 200
    r = s.post(f"{BASE}/api/auth/logout")
    assert r.status_code == 200
    r = s.get(f"{BASE}/api/auth/me")
    assert r.status_code == 401, "session should be invalid after logout"


# ── Security Headers ─────────────────────────────────

def test_security_headers():
    r = admin_session.get(f"{BASE}/api/auth/me")
    h = r.headers
    assert h.get("X-Content-Type-Options") == "nosniff", "missing X-Content-Type-Options"
    assert h.get("X-Frame-Options") == "DENY", "missing X-Frame-Options"
    assert "no-store" in h.get("Cache-Control", ""), "missing Cache-Control no-store"
    assert "Strict-Transport-Security" in h, "missing HSTS header"
    assert "Content-Security-Policy" in h, "missing CSP header"
    assert h.get("Referrer-Policy") == "strict-origin-when-cross-origin", "missing Referrer-Policy"


# ── Patients ──────────────────────────────────────────

def test_list_patients():
    r = admin_session.get(f"{BASE}/api/patients")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

def test_get_patient_by_code():
    patients = admin_session.get(f"{BASE}/api/patients").json()
    if patients:
        code = patients[0].get("patient_code") or patients[0].get("id")
        r = admin_session.get(f"{BASE}/api/patients/{code}")
        assert r.status_code == 200


# ── Users (admin) ─────────────────────────────────────

def test_list_users():
    r = admin_session.get(f"{BASE}/api/users")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) > 0

def test_users_picker():
    r = admin_session.get(f"{BASE}/api/users/picker")
    assert r.status_code == 200


# ── Roles ─────────────────────────────────────────────

def test_list_roles():
    r = admin_session.get(f"{BASE}/api/roles")
    assert r.status_code == 200
    assert len(r.json()) > 0

def test_roles_permissions():
    r = admin_session.get(f"{BASE}/api/roles/permissions")
    assert r.status_code == 200


# ── Audit ─────────────────────────────────────────────

def test_audit_logs():
    r = admin_session.get(f"{BASE}/api/audit/logs")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data

def test_audit_stats():
    r = admin_session.get(f"{BASE}/api/audit/stats")
    assert r.status_code == 200

def test_audit_verify():
    r = admin_session.get(f"{BASE}/api/audit/verify")
    assert r.status_code == 200
    data = r.json()
    assert "intact" in data
    if not data["intact"]:
        print(f"         WARNING: {data['broken_entries']} broken entries in hash chain")

def test_audit_export_csv():
    r = admin_session.get(f"{BASE}/api/audit/export")
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("Content-Type", "")
    assert r.text.startswith("ID,")


# ── Beds ──────────────────────────────────────────────

def test_list_beds():
    r = admin_session.get(f"{BASE}/api/beds")
    assert r.status_code == 200

def test_list_all_beds():
    r = admin_session.get(f"{BASE}/api/beds/all")
    assert r.status_code == 200


# ── Care Teams ────────────────────────────────────────

def test_list_careteams():
    r = admin_session.get(f"{BASE}/api/careteams")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ── Categories / Tenant ───────────────────────────────

def test_tenant_info():
    r = admin_session.get(f"{BASE}/api/tenant")
    assert r.status_code == 200

def test_categories():
    r = admin_session.get(f"{BASE}/api/categories")
    assert r.status_code == 200


# ── Form Templates ────────────────────────────────────

def test_list_templates():
    r = admin_session.get(f"{BASE}/api/templates")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ── RBAC Enforcement ──────────────────────────────────

def test_frontdesk_cannot_list_users():
    """frontdesk role should not have users.manage permission."""
    r = frontdesk_session.get(f"{BASE}/api/users")
    assert r.status_code == 403, f"expected 403, got {r.status_code}"

def test_frontdesk_cannot_access_audit():
    """frontdesk role should not have audit.view permission."""
    r = frontdesk_session.get(f"{BASE}/api/audit/logs")
    assert r.status_code == 403, f"expected 403, got {r.status_code}"


# ── Tenant Isolation ──────────────────────────────────

def test_cannot_see_other_tenant_data():
    """admin1 (tenant 1) should not see admin2 (tenant 2) in user list."""
    users = admin_session.get(f"{BASE}/api/users").json()
    usernames = [u["username"] for u in users]
    assert "admin2" not in usernames, "tenant isolation broken — can see other tenant's users"


# ── Protected Ping ────────────────────────────────────

def test_protected_ping():
    r = admin_session.get(f"{BASE}/api/protected/ping")
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ── Runner ────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n{'='*60}")
    print(f"  AegleroEMR Smoke Tests — {BASE}")
    print(f"{'='*60}\n")

    try:
        setup()
    except Exception as e:
        print(f"\n  FATAL: setup failed — {e}")
        sys.exit(1)

    print()

    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]

    for t in tests:
        test(t.__name__, t)

    print(f"\n{'='*60}")
    print(f"  Results: {passed} passed, {failed} failed, {passed + failed} total")
    print(f"{'='*60}")

    if errors:
        print("\nFailures:")
        for name, msg in errors:
            print(f"  - {name}: {msg}")

    sys.exit(1 if failed else 0)
