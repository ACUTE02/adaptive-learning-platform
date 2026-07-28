import uuid
from typing import Optional
from sqlmodel import Field, SQLModel

class SyllabusNodes(SQLModel, table=True):
    __tablename__ = "syllabus_nodes"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str
    parent_id: Optional[uuid.UUID] = Field(default=None, foreign_key="syllabus_nodes.id")
    content_markdown: str
    mastery_status: str = Field(default="Locked")
    difficulty_level: int = Field(default=1)

class AssessmentLogs(SQLModel, table=True):
    __tablename__ = "assessment_logs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    node_id: uuid.UUID = Field(foreign_key="syllabus_nodes.id")
    score: float
    time_spent_seconds: int
    difficulty_level: int
