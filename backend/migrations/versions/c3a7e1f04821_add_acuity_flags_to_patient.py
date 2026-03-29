"""add acuity_flags to patient

Revision ID: c3a7e1f04821
Revises: b2dcffaa1513
Create Date: 2026-03-29 04:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3a7e1f04821'
down_revision = 'b2dcffaa1513'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.add_column(sa.Column('acuity_flags', sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.drop_column('acuity_flags')
