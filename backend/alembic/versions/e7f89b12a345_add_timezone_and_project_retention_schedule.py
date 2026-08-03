"""add_timezone_and_project_retention_schedule

Revision ID: e7f89b12a345
Revises: 25712a644e8e
Create Date: 2026-08-03 22:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7f89b12a345'
down_revision: Union[str, None] = '25712a644e8e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add timezone to companies table
    op.add_column('companies', sa.Column('timezone', sa.String(length=64), server_default=sa.text("'UTC'"), nullable=True))

    # Add retention_mode, delete_date, delete_time to projects table
    op.add_column('projects', sa.Column('retention_mode', sa.String(length=32), server_default=sa.text("'rolling_days'"), nullable=True))
    op.add_column('projects', sa.Column('delete_date', sa.String(length=32), nullable=True))
    op.add_column('projects', sa.Column('delete_time', sa.String(length=32), server_default=sa.text("'02:00:00'"), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'delete_time')
    op.drop_column('projects', 'delete_date')
    op.drop_column('projects', 'retention_mode')
    op.drop_column('companies', 'timezone')
