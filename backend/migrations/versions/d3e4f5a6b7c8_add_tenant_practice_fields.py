"""add tenant practice fields

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-03-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'd3e4f5a6b7c8'
down_revision = 'c2d3e4f5a6b7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tenant', sa.Column('npi', sa.String(length=10), nullable=True))
    op.add_column('tenant', sa.Column('phone', sa.String(length=30), nullable=True))
    op.add_column('tenant', sa.Column('email', sa.String(length=120), nullable=True))
    op.add_column('tenant', sa.Column('address', sa.String(length=255), nullable=True))


def downgrade():
    op.drop_column('tenant', 'address')
    op.drop_column('tenant', 'email')
    op.drop_column('tenant', 'phone')
    op.drop_column('tenant', 'npi')
