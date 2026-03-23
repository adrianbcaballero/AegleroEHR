"""add login_attempt table for rate limiting

Revision ID: e1f973c14541
Revises: efc3f8765b93
Create Date: 2026-03-23 20:25:42.418063

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e1f973c14541'
down_revision = 'efc3f8765b93'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('login_attempt',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('ip_address', sa.String(length=45), nullable=False),
    sa.Column('attempted_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('login_attempt', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_login_attempt_ip_address'), ['ip_address'], unique=False)


def downgrade():
    with op.batch_alter_table('login_attempt', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_login_attempt_ip_address'))

    op.drop_table('login_attempt')
