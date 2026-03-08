import os
from flask import Flask, g
from flask_cors import CORS
import config
from extensions import db, migrate
from services.config_validator import validate_config


def create_app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = config.DATABASE_URL
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"] = config.SECRET_KEY

    origins = config.CORS_ORIGINS
    if isinstance(origins, str):
        origins = [o.strip() for o in origins.split(",") if o.strip()]

    CORS(app, origins=origins)


    db.init_app(app)
    migrate.init_app(app, db)


    from routes.auth import auth_bp
    from auth_middleware import require_auth

    app.register_blueprint(auth_bp)

    from routes.patients import patients_bp
    app.register_blueprint(patients_bp)

    from routes.users import users_bp
    app.register_blueprint(users_bp)

    from routes.clinical import clinical_bp
    app.register_blueprint(clinical_bp)

    from routes.audit import audit_bp
    app.register_blueprint(audit_bp)

    from routes.forms import forms_bp
    app.register_blueprint(forms_bp)

    from routes.consent import consent_bp
    app.register_blueprint(consent_bp)

    from routes.categories import categories_bp
    app.register_blueprint(categories_bp)

    from routes.roles import roles_bp
    app.register_blueprint(roles_bp)

    from routes.beds import beds_bp
    app.register_blueprint(beds_bp)

    # Import models so Alembic can detect
    import models

    @app.after_request
    def add_security_headers(response):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains" # use only over HTTPS in production
        response.headers["X-Content-Type-Options"] = "nosniff" #prvent browser from reading response as different MIME type (script as a image)
        response.headers["X-Frame-Options"] = "DENY" # prevent clickjacking
        response.headers["X-XSS-Protection"] = "1; mode=block" # enable basic XSS protection in older browsers (modern browsers use CSP instead)
        response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'" # restrict all content to same origin, prevent framing
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin" # Strips the header down if navigating to a different origin, but sends full URL when navigating within the same origin. This is a good balance between privacy and functionality for an EMR.
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate" # prevent caching of sensitive data
        response.headers["Pragma"] = "no-cache" # HTTP 1.0 backward compatibility for no-cache
        return response

    validate_config(app)

    @app.get("/api/protected/ping")
    @require_auth()
    def protected_ping():
        return {"ok": True, "user": {"id": g.user.id, "username": g.user.username, "role": g.user.role_name}}

    return app

app = create_app()

if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=5000, debug=debug)  # nosec B104
