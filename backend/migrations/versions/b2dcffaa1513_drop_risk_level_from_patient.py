"""drop risk_level from patient

Revision ID: b2dcffaa1513
Revises: 14e254cc4595
Create Date: 2026-03-29 03:58:35.582133

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2dcffaa1513'
down_revision = '14e254cc4595'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.drop_column('risk_level')


def downgrade():
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.add_column(sa.Column('risk_level', sa.VARCHAR(length=20), server_default='low', nullable=False))
