from flask import Blueprint

clinical_bp = Blueprint("clinical", __name__, url_prefix="/api/patients")
