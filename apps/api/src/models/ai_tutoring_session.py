from typing import Optional
from datetime import datetime, timezone
from sqlmodel import Field, SQLModel

class AITutoringSession(SQLModel, table=True):
    __tablename__ = "ai_tutoring_sessions"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: str = Field(index=True)
    struggle_area: str
    scaffolding_text: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
