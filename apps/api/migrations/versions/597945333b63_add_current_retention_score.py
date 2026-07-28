"""Add current_retention_score

Revision ID: 597945333b63
Revises: 26e8254135b4
Create Date: 2026-07-12 22:13:23.216065

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa # noqa: F401
import sqlmodel # noqa: F401
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '597945333b63'
down_revision: Union[str, None] = '26e8254135b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('campaign_module', sa.Column('current_retention_score', sa.Integer(), nullable=False, server_default='100'))

def downgrade() -> None:
    op.drop_column('campaign_module', 'current_retention_score')

