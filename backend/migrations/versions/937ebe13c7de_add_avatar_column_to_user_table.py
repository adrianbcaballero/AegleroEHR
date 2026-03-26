"""add avatar column to user table

Revision ID: 937ebe13c7de
Revises: 95c9b984b770
Create Date: 2026-03-26 21:37:48.811854

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '937ebe13c7de'
down_revision = '95c9b984b770'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('avatar', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('avatar')
