import math
import logging
import os
from datetime import datetime, timezone
from sqlalchemy import text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from src.db.engine_models import Assessment, Campaign, CampaignModuleDB

logger = logging.getLogger(__name__)

# Arbitrary constant identifying the decay job in pg advisory-lock space.
DECAY_JOB_LOCK_ID = 7242001

def calculate_retention_probability(days_elapsed: float, last_score: float) -> float:
    """
    Implements the Ebbinghaus Forgetting Curve: R = e^(-t / S)
    """
    strength = max(1.0, last_score / 10.0)
    # Clock skew must never produce a retention above 100%.
    days_elapsed = max(0.0, days_elapsed)
    retention_prob = math.exp(-days_elapsed / strength)
    return retention_prob


async def evaluate_user_decay(db_session: AsyncSession, user_id: str):
    """
    Evaluate all completed module assessments for a user and flag modules
    for remediation if their retention probability drops below 80%.
    """
    string_user_id = str(user_id)
    
    # Get all campaigns for the user
    campaign_stmt = select(Campaign.id).where(Campaign.user_id == string_user_id)
    campaign_ids = (await db_session.execute(campaign_stmt)).scalars().all()
    
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    
    for camp_id in campaign_ids:
        statement = (
            select(Assessment, CampaignModuleDB)
            .join(Campaign, Assessment.campaign_id == Campaign.id)
            .join(CampaignModuleDB, Assessment.module_id == CampaignModuleDB.id)
            .where(Campaign.id == camp_id)
            .where(Assessment.status == 'completed')
            .where(Assessment.type == 'module_quiz')
            .where(Assessment.score >= Assessment.total_marks * 0.8)
        )
        
        results = (await db_session.execute(statement)).all()
        
        if not results:
            continue
            
        try:
            for assessment, module in results:
                if assessment.updated_at is None:
                    days_elapsed = 0
                else:
                    updated_naive = assessment.updated_at.replace(tzinfo=None)
                    days_elapsed = (now - updated_naive).days
                
                if assessment.total_marks and assessment.total_marks > 0:
                    score = (float(assessment.score) / assessment.total_marks) * 100 if assessment.score is not None else 85.0
                else:
                    score = float(assessment.score) if assessment.score is not None else 85.0
                retention_probability = calculate_retention_probability(days_elapsed, score)
                
                logger.debug("Decay: module=%s days=%s retention=%.3f", assessment.module_id, days_elapsed, retention_probability)

                # Save exact score to database unconditionally for charting
                score_int = int(retention_probability * 100)
                module.current_retention_score = score_int
                db_session.add(module)
                
                if retention_probability < 0.80:
                    module.requires_remediation = True
                    
            await db_session.commit()
        except Exception as e:
            await db_session.rollback()
            logger.error(f"[ANALYTICS] DB Batch Commit Failed for campaign {camp_id}: {e}")


def _excluded_users() -> set:
    # Accounts whose modules never decay (demo / seed accounts). Comma-separated emails.
    raw = os.getenv("DECAY_EXCLUDED_USERS", "admin@school.dev")
    return {u.strip() for u in raw.split(",") if u.strip()}


async def run_knowledge_decay_job(session_factory) -> dict:
    """
    Daily decay pass over every user that owns a campaign.

    Safe with several workers or replicas: only the process that wins a
    Postgres advisory lock runs the pass, the others skip. The lock is
    transaction-scoped, so it also works behind a transaction-mode pooler and
    is released automatically if the process dies.
    """
    stats = {"ran": False, "users": 0, "failed": 0}
    async with session_factory() as lock_session:
        if lock_session.get_bind().dialect.name == "postgresql":
            got_lock = (await lock_session.execute(
                text("SELECT pg_try_advisory_xact_lock(:id)"), {"id": DECAY_JOB_LOCK_ID}
            )).scalar()
            if not got_lock:
                logger.info("Knowledge decay job skipped: another worker holds the lock")
                return stats

        stats["ran"] = True
        users = (await lock_session.execute(select(Campaign.user_id).distinct())).scalars().all()
        excluded = _excluded_users()

        for user_key in users:
            if user_key in excluded:
                continue
            stats["users"] += 1
            try:
                async with session_factory() as user_session:
                    await evaluate_user_decay(user_session, user_key)
            except Exception:
                # One user's failure must not stop the pass for everyone else.
                stats["failed"] += 1
                logger.exception("Knowledge decay failed for one user; continuing")

        await lock_session.rollback()  # releases the advisory lock

    logger.info("Knowledge decay job finished: users=%d failed=%d", stats["users"], stats["failed"])
    return stats

