"""add required_for_admission and required_for_discharge to form_template

Revision ID: f6a7b8c9d0e1
Revises: 3add2cd44a0c
Create Date: 2026-03-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f6a7b8c9d0e1'
down_revision = '3add2cd44a0c'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('form_template', schema=None) as batch_op:
        batch_op.add_column(sa.Column('required_for_admission', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('required_for_discharge', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table('form_template', schema=None) as batch_op:
        batch_op.drop_column('required_for_discharge')
        batch_op.drop_column('required_for_admission')
