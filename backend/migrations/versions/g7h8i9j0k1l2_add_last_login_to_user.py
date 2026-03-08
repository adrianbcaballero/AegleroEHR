"""add last_login and agreed_to_terms_at to user

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-03-08 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "g7h8i9j0k1l2"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user", sa.Column("last_login", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user", sa.Column("agreed_to_terms_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("user", "agreed_to_terms_at")
    op.drop_column("user", "last_login")
