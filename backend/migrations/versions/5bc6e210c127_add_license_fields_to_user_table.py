"""add license fields to user table

Revision ID: 5bc6e210c127
Revises: 937ebe13c7de
Create Date: 2026-03-27 03:30:18.361261

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5bc6e210c127'
down_revision = '937ebe13c7de'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('state_license', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('npi_number', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('dea_number', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('primary_license', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('secondary_license', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('nadean_number', sa.String(length=20), nullable=True))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('nadean_number')
        batch_op.drop_column('secondary_license')
        batch_op.drop_column('primary_license')
        batch_op.drop_column('dea_number')
        batch_op.drop_column('npi_number')
        batch_op.drop_column('state_license')
