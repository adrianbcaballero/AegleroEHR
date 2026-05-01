"""widen audit_log.description from varchar(255) to text

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-04-30 00:00:00.000000

Detailed audit log descriptions (field-level diffs on patient/role/form updates)
exceed 255 chars. PostgreSQL TEXT has no length limit; SQLite TEXT is also
unlimited. This is a non-destructive widening — no data loss.
"""
from alembic import op
import sqlalchemy as sa


revision = "o5p6q7r8s9t0"
down_revision = "n4o5p6q7r8s9"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("audit_log") as batch_op:
        batch_op.alter_column(
            "description",
            existing_type=sa.String(length=255),
            type_=sa.Text(),
            existing_nullable=True,
        )


def downgrade():
    # Truncate any descriptions that exceed 255 chars before narrowing the type,
    # otherwise the alter would fail. This is irreversible for those rows.
    op.execute("UPDATE audit_log SET description = LEFT(description, 255) WHERE LENGTH(description) > 255")
    with op.batch_alter_table("audit_log") as batch_op:
        batch_op.alter_column(
            "description",
            existing_type=sa.Text(),
            type_=sa.String(length=255),
            existing_nullable=True,
        )
