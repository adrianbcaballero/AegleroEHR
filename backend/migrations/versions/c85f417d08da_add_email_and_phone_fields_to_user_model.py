"""add email and phone fields to user model

Revision ID: c85f417d08da
Revises: e1f973c14541
Create Date: 2026-03-24 07:06:59.841383

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c85f417d08da'
down_revision = 'e1f973c14541'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('email', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('phone', sa.String(length=30), nullable=True))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('phone')
        batch_op.drop_column('email')
