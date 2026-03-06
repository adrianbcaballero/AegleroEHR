"""add category_order to tenant

Revision ID: a1c2d3e4f5b6
Revises: f3a9e2c1b4d7
Create Date: 2026-03-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1c2d3e4f5b6'
down_revision = 'f3a9e2c1b4d7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tenant', sa.Column('category_order', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('tenant', 'category_order')
