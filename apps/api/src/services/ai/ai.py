import logging
from typing import Tuple, Dict, Any
from fastapi import Depends, HTTPException, Request
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.security.features_utils.usage import (
    refund_ai_credit,
    reserve_ai_credit,
)
from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user, resolve_acting_user_id
from src.services.ai.base import (
    ask_ai,
    get_chat_session_history,
    save_message_to_history,
)


