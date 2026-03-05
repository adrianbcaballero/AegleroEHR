"""
Startup configuration validator.
Ensures security-critical settings are properly configured before the app serves requests.
Prevents silent deployment with insecure defaults (NIST SP 800-123).
"""

import os
import sys

# Values that should never be used in a real deployment
INSECURE_SECRETS = {"dev_secret", "change_me", "secret", "password", ""}


def validate_config(app):
    """
    Checks security-critical config values at startup.
    In production (FLASK_ENV=production or DEBUG=False), insecure values cause a hard exit.
    In development, they print warnings so you're aware but not blocked.
    """
    is_production = (
        os.getenv("FLASK_ENV") == "production"
        or os.getenv("ENVIRONMENT") == "production"
    )

    errors = []
    warnings = []

    # SECRET_KEY must not be a known default
    secret_key = app.config.get("SECRET_KEY", "")
    if secret_key in INSECURE_SECRETS:
        errors.append("SECRET_KEY is set to an insecure default — generate a real secret with: python -c \"import secrets; print(secrets.token_urlsafe(64))\"")

    # DATABASE_URL should point to Postgres in production, not SQLite
    db_url = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    if "sqlite" in db_url:
        warnings.append("DATABASE_URL is using SQLite — use PostgreSQL for anything beyond local development")

    # CORS_ORIGINS should not be wildcard in production
    cors_origins = os.getenv("CORS_ORIGINS", "")
    if cors_origins == "*":
        errors.append("CORS_ORIGINS is set to '*' — restrict to your frontend domain")

    if is_production:
        if errors:
            print("\n[FATAL] Configuration validation failed:\n", file=sys.stderr)
            for e in errors:
                print(f"  - {e}", file=sys.stderr)
            print("\nFix these before deploying to production.\n", file=sys.stderr)
            sys.exit(1)
        if warnings:
            print("\n[WARNING] Configuration issues detected:\n", file=sys.stderr)
            for w in warnings:
                print(f"  - {w}", file=sys.stderr)
            print()
    else:
        # Development mode — warn but don't block
        all_issues = errors + warnings
        if all_issues:
            print("\n[DEV WARNING] Configuration issues (non-blocking):\n", file=sys.stderr)
            for issue in all_issues:
                print(f"  - {issue}", file=sys.stderr)
            print()