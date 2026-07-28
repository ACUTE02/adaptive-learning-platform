from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB


class StudentRating(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    skill_rating: float = Field(default=100.0)
    total_evaluations: int = Field(default=0)
    last_updated: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class EvaluationLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    is_correct: bool
    time_taken_seconds: int
    rating_change: float
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class Campaign(SQLModel, table=True):
    __tablename__ = "campaign"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    title: str
    syllabus_text: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    difficulty_tier: int = Field(default=1)
    modules: List["CampaignModuleDB"] = Relationship(back_populates="campaign", sa_relationship_kwargs={"cascade": "all, delete-orphan", "passive_deletes": True})
    assessments: List["Assessment"] = Relationship(back_populates="campaign", sa_relationship_kwargs={"cascade": "all, delete-orphan", "passive_deletes": True})

class CampaignModuleDB(SQLModel, table=True):
    __tablename__ = "campaign_module"
    id: Optional[int] = Field(default=None, primary_key=True)
    campaign_id: int = Field(foreign_key="campaign.id", ondelete="CASCADE")
    title: str
    description: str
    teaching_prompt: str
    subtopics: Optional[str] = Field(default=None)
    status: str
    order_index: int
    is_remediation: bool = Field(default=False)
    requires_remediation: bool = Field(default=False)
    current_retention_score: float = Field(default=100.0)
    campaign: Optional["Campaign"] = Relationship(back_populates="modules")
    assessment: Optional["Assessment"] = Relationship(back_populates="module", sa_relationship_kwargs={"cascade": "all, delete-orphan", "passive_deletes": True})

class Assessment(SQLModel, table=True):
    __tablename__ = "assessment"
    id: Optional[int] = Field(default=None, primary_key=True)
    campaign_id: int = Field(foreign_key="campaign.id", ondelete="CASCADE")
    module_id: Optional[int] = Field(default=None, foreign_key="campaign_module.id", ondelete="SET NULL")
    type: str  # 'module_quiz' or 'capstone'
    status: str  # 'locked', 'available', 'completed'
    score: Optional[int] = Field(default=None)
    exam_data: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSONB))
    
    cancelled_count: int = Field(default=0)
    total_marks: int = Field(default=50)
    time_allowed_mins: int = Field(default=30)
    updated_at: Optional[datetime] = Field(default=None, sa_column_kwargs={"onupdate": lambda: datetime.now(timezone.utc).replace(tzinfo=None)})

    campaign: Optional["Campaign"] = Relationship(back_populates="assessments")
    module: Optional["CampaignModuleDB"] = Relationship(back_populates="assessment")
class Course(SQLModel, table=True):
    __tablename__ = 'course'
    id: Optional[int] = Field(default=None, primary_key=True)

class Activity(SQLModel, table=True):
    __tablename__ = 'activity'
    id: Optional[int] = Field(default=None, primary_key=True)
