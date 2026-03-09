from flask import Blueprint, request, g
from sqlalchemy.exc import IntegrityError

from auth_middleware import require_auth
from extensions import db
from models import CareTeam, CareTeamMember, Patient, User
from services.helpers import tenant_query

careteams_bp = Blueprint("careteams", __name__, url_prefix="/api/careteams")


def _serialize_team(team: CareTeam):
    members = []
    for m in team.members:
        u = User.query.get(m.user_id)
        members.append({
            "userId": m.user_id,
            "username": u.username if u else None,
            "fullName": u.full_name if u else None,
        })
    patient_count = Patient.query.filter_by(
        care_team_id=team.id, tenant_id=g.tenant_id
    ).count()
    return {
        "id": team.id,
        "name": team.name,
        "members": members,
        "patientCount": patient_count,
    }


@careteams_bp.get("")
@require_auth(permission="careteam.manage")
def list_careteams():
    teams = tenant_query(CareTeam).all()
    return [_serialize_team(t) for t in teams], 200


@careteams_bp.post("")
@require_auth(permission="careteam.manage")
def create_careteam():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return {"error": "name is required"}, 400

    team = CareTeam(tenant_id=g.tenant_id, name=name)
    db.session.add(team)
    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        return {"error": "a care team with that name already exists"}, 409

    for uid in (data.get("memberIds") or []):
        if User.query.filter_by(id=uid, tenant_id=g.tenant_id).first():
            db.session.add(CareTeamMember(care_team_id=team.id, user_id=uid))

    db.session.commit()
    return _serialize_team(team), 201


@careteams_bp.put("/<int:team_id>")
@require_auth(permission="careteam.manage")
def update_careteam(team_id):
    team = tenant_query(CareTeam).filter_by(id=team_id).first()
    if not team:
        return {"error": "care team not found"}, 404

    data = request.get_json(silent=True) or {}

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return {"error": "name cannot be empty"}, 400
        team.name = name

    if "memberIds" in data:
        CareTeamMember.query.filter_by(care_team_id=team.id).delete()
        for uid in (data["memberIds"] or []):
            if User.query.filter_by(id=uid, tenant_id=g.tenant_id).first():
                db.session.add(CareTeamMember(care_team_id=team.id, user_id=uid))

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "a care team with that name already exists"}, 409

    return _serialize_team(team), 200


@careteams_bp.delete("/<int:team_id>")
@require_auth(permission="careteam.manage")
def delete_careteam(team_id):
    team = tenant_query(CareTeam).filter_by(id=team_id).first()
    if not team:
        return {"error": "care team not found"}, 404

    patient_count = Patient.query.filter_by(
        care_team_id=team.id, tenant_id=g.tenant_id
    ).count()
    if patient_count:
        return {"error": f"cannot delete — {patient_count} patient(s) assigned to this care team"}, 409

    db.session.delete(team)
    db.session.commit()
    return {}, 204
