"""add project retention days

Revision ID: 4b9a2f1c7d8a
Revises: 3d67030093b7
Create Date: 2026-07-14 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b9a2f1c7d8a'
down_revision: Union[str, None] = '3d67030093b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('retention_days', sa.Integer(), server_default=sa.text('30'), nullable=False))
    op.create_index(op.f('ix_projects_retention_days'), 'projects', ['retention_days'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_projects_retention_days'), table_name='projects')
    op.drop_column('projects', 'retention_days')
