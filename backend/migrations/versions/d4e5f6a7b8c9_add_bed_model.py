"""add bed model and patient.assigned_bed_id

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-07
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    # ── Create the bed table ──────────────────────────────────────────────
    op.create_table(
        "bed",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenant.id", ondelete="CASCADE"), nullable=False),
        sa.Column("unit", sa.String(80), nullable=True),
        sa.Column("room", sa.String(20), nullable=True),
        sa.Column("bed_label", sa.String(10), nullable=True),
        sa.Column("display_name", sa.String(50), nullable=False),
        sa.Column("notes", sa.String(200), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="available"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_bed_tenant_id", "bed", ["tenant_id"])

    # ── Add assigned_bed_id FK to patient ────────────────────────────────
    op.add_column(
        "patient",
        sa.Column("assigned_bed_id", sa.Integer, nullable=True),
    )
    op.create_foreign_key(
        "fk_patient_assigned_bed",
        "patient", "bed",
        ["assigned_bed_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("fk_patient_assigned_bed", "patient", type_="foreignkey")
    op.drop_column("patient", "assigned_bed_id")
    op.drop_index("ix_bed_tenant_id", table_name="bed")
    op.drop_table("bed")
