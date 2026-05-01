"""add is_system to form_template

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-05-01 00:00:00.000000

Marks Aeglero-shipped form templates so the UI can render them with the
Aeglero brand icon (vs the generic icon for tenant-created templates).
"""
from alembic import op
import sqlalchemy as sa


revision = "p6q7r8s9t0u1"
down_revision = "o5p6q7r8s9t0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "form_template",
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("form_template", "is_system")
