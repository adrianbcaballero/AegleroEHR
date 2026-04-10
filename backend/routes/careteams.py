from flask import Blueprint, request, g
from sqlalchemy.exc import IntegrityError

from auth_middleware import require_auth
from extensions import db
from models import CareTeam, CareTeamMember, Patient, User
from services.audit_logger import log_access
from services.helpers import client_ip, tenant_query

careteams_bp = Blueprint("careteams", __name__, url_prefix="/api/careteams")


def _serialize_team(team: CareTeam):
    member_ids = [m.user_id for m in team.members]
    users_map = {u.id: u for u in User.query.filter(
        User.id.in_(member_ids), User.tenant_id == g.tenant_id
    ).all()} if member_ids else {}
    members = []
    for m in team.members:
        u = users_map.get(m.user_id)
        members.append({
            "userId": m.user_id,
            "username": u.username if u else None,
            "fullName": u.full_name if u else None,
        })
    patient_count = Patient.query.filter_by(
        care_team_id=team.id, tenant_id=g.tenant_id, status="active"
    ).count()
    return {
        "id": team.id,
        "name": team.name,
        "description": team.description,
        "leadUserId": team.lead_user_id,
        "leadUserName": team.lead_user.full_name or team.lead_user.username if team.lead_user else None,
        "members": members,
        "patientCount": patient_count,
    }


@careteams_bp.get("")
@require_auth(any_of=["patients.edit", "frontdesk.patients.pending", "users.manage", "careteam.manage"])
def list_careteams():
    teams = tenant_query(CareTeam).all()
    return [_serialize_team(t) for t in teams], 200


@careteams_bp.post("")
@require_auth(permission="careteam.manage")
def create_careteam():
    ip = client_ip()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return {"error": "name is required"}, 400

    description = (data.get("description") or "").strip() or None
    if description and len(description) > 150:
        return {"error": "description cannot exceed 150 characters"}, 400
    lead_user_id = data.get("leadUserId") or None

    team = CareTeam(tenant_id=g.tenant_id, name=name, description=description, lead_user_id=lead_user_id)
    db.session.add(team)
    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        log_access(g.user.id, "CARETEAM_CREATE", "careteams", "FAILED", ip, description=f"Care team creation failed — name '{name}' already exists")
        return {"error": "a care team with that name already exists"}, 409

    member_names = []
    for uid in (data.get("memberIds") or []):
        u = User.query.filter_by(id=uid, tenant_id=g.tenant_id).first()
        if u:
            db.session.add(CareTeamMember(care_team_id=team.id, user_id=uid))
            member_names.append(u.full_name or u.username)

    db.session.commit()
    parts = []
    if lead_user_id:
        lead = User.query.filter_by(id=lead_user_id, tenant_id=g.tenant_id).first()
        if lead:
            parts.append(f"team lead: {lead.full_name or lead.username}")
    members_desc = f": {', '.join(member_names)}" if member_names else ""
    parts.append(f"{len(member_names)} member(s){members_desc}")
    log_access(g.user.id, "CARETEAM_CREATE", f"careteam/{team.id}", "SUCCESS", ip, description=f"Created care team '{name}' — {', '.join(parts)}")
    return _serialize_team(team), 201


@careteams_bp.put("/<int:team_id>")
@require_auth(permission="careteam.manage")
def update_careteam(team_id):
    ip = client_ip()
    team = tenant_query(CareTeam).filter_by(id=team_id).first()
    if not team:
        log_access(g.user.id, "CARETEAM_UPDATE", f"careteam/{team_id}", "FAILED", ip, description=f"Care team #{team_id} not found")
        return {"error": "care team not found"}, 404

    data = request.get_json(silent=True) or {}
    changes = []

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return {"error": "name cannot be empty"}, 400
        if name != team.name:
            changes.append(f"name → '{name}'")
        team.name = name

    if "description" in data:
        desc = (data["description"] or "").strip() or None
        if desc and len(desc) > 150:
            return {"error": "description cannot exceed 150 characters"}, 400
        if desc != team.description:
            changes.append("description updated")
        team.description = desc

    if "leadUserId" in data:
        new_lead = data["leadUserId"] or None
        if new_lead != team.lead_user_id:
            if new_lead:
                lead_user = User.query.filter_by(id=new_lead, tenant_id=g.tenant_id).first()
                changes.append(f"team lead → {lead_user.full_name or lead_user.username}" if lead_user else "team lead updated")
            else:
                changes.append("team lead removed")
        team.lead_user_id = new_lead

    if "memberIds" in data:
        old_member_ids = set(m.user_id for m in CareTeamMember.query.filter_by(care_team_id=team.id).all())
        new_member_ids = set()
        user_names = {}
        for uid in (data["memberIds"] or []):
            u = User.query.filter_by(id=uid, tenant_id=g.tenant_id).first()
            if u:
                new_member_ids.add(u.id)
                user_names[u.id] = u.full_name or u.username
        # Also resolve names for removed members
        for uid in (old_member_ids - new_member_ids):
            u = User.query.filter_by(id=uid, tenant_id=g.tenant_id).first()
            if u:
                user_names[u.id] = u.full_name or u.username

        added_ids = sorted(new_member_ids - old_member_ids)
        removed_ids = sorted(old_member_ids - new_member_ids)

        CareTeamMember.query.filter_by(care_team_id=team.id).delete()
        for uid in new_member_ids:
            db.session.add(CareTeamMember(care_team_id=team.id, user_id=uid))

        member_parts = []
        if added_ids:
            member_parts.append(f"added: {', '.join(user_names.get(uid, str(uid)) for uid in added_ids)}")
        if removed_ids:
            member_parts.append(f"removed: {', '.join(user_names.get(uid, str(uid)) for uid in removed_ids)}")
        if member_parts:
            changes.append(f"members updated — {'; '.join(member_parts)}")
        elif old_member_ids != new_member_ids:
            changes.append("members updated")

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        log_access(g.user.id, "CARETEAM_UPDATE", f"careteam/{team_id}", "FAILED", ip, description=f"Care team update failed — name already exists")
        return {"error": "a care team with that name already exists"}, 409

    log_access(g.user.id, "CARETEAM_UPDATE", f"careteam/{team.id}", "SUCCESS", ip, description=f"Updated care team '{team.name}': {', '.join(changes)}" if changes else f"No changes to care team '{team.name}'")
    return _serialize_team(team), 200


@careteams_bp.delete("/<int:team_id>")
@require_auth(permission="careteam.manage")
def delete_careteam(team_id):
    ip = client_ip()
    team = tenant_query(CareTeam).filter_by(id=team_id).first()
    if not team:
        log_access(g.user.id, "CARETEAM_DELETE", f"careteam/{team_id}", "FAILED", ip, description=f"Care team #{team_id} not found")
        return {"error": "care team not found"}, 404

    patient_count = Patient.query.filter_by(
        care_team_id=team.id, tenant_id=g.tenant_id, status="active"
    ).count()
    if patient_count:
        log_access(g.user.id, "CARETEAM_DELETE", f"careteam/{team.id}", "FAILED", ip, description=f"Cannot delete '{team.name}' — {patient_count} active patient(s) assigned")
        return {"error": f"cannot delete — {patient_count} patient(s) assigned to this care team"}, 409

    team_name = team.name
    db.session.delete(team)
    db.session.commit()
    log_access(g.user.id, "CARETEAM_DELETE", f"careteam/{team_id}", "SUCCESS", ip, description=f"Deleted care team '{team_name}'")
    return {"ok": True}, 200
