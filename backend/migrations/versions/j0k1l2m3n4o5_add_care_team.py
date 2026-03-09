"""add care_team and care_team_member tables; add care_team_id to patient

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-03-09 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "j0k1l2m3n4o5"
down_revision = "i9j0k1l2m3n4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "care_team",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenant.id"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.UniqueConstraint("tenant_id", "name", name="uq_tenant_care_team_name"),
    )

    op.create_table(
        "care_team_member",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("care_team_id", sa.Integer, sa.ForeignKey("care_team.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("user.id"), nullable=False, index=True),
        sa.UniqueConstraint("care_team_id", "user_id", name="uq_care_team_member"),
    )

    op.add_column(
        "patient",
        sa.Column("care_team_id", sa.Integer, sa.ForeignKey("care_team.id"), nullable=True),
    )
    op.create_index("ix_patient_care_team_id", "patient", ["care_team_id"])


def downgrade():
    op.drop_index("ix_patient_care_team_id", table_name="patient")
    op.drop_column("patient", "care_team_id")
    op.drop_table("care_team_member")
    op.drop_table("care_team")
