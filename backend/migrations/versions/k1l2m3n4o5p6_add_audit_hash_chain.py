"""add hash chain columns to audit_log for tamper detection

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-03-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "k1l2m3n4o5p6"
down_revision = "j0k1l2m3n4o5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("audit_log", sa.Column("prev_hash", sa.String(64), nullable=True))
    op.add_column("audit_log", sa.Column("entry_hash", sa.String(64), nullable=True))


def downgrade():
    op.drop_column("audit_log", "entry_hash")
    op.drop_column("audit_log", "prev_hash")
