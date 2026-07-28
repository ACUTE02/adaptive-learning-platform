"""merge conflicting heads

Revision ID: 8166162be4ed
Revises: 720b3fa29423, a1b2c3d4e5f7
Create Date: 2026-07-01 19:03:25.448549

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa # noqa: F401
import sqlmodel # noqa: F401


# revision identifiers, used by Alembic.
revision: str = '8166162be4ed'
down_revision: Union[str, None] = ('720b3fa29423', 'a1b2c3d4e5f7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
