import math
import logging
from datetime import datetime, timezone
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from src.db.engine_models import Assessment, Campaign, CampaignModuleDB

logger = logging.getLogger(__name__)

def calculate_retention_probability(days_elapsed: float, last_score: float) -> float:
    """
    Implements the Ebbinghaus Forgetting Curve: R = e^(-t / S)
    """
    strength = max(1.0, last_score / 10.0)
    retention_prob = math.exp(-days_elapsed / strength)
    return retention_prob


async def evaluate_user_decay(db_session: AsyncSession, user_id: str):
    """
    Evaluate all completed module assessments for a user and flag modules
    for remediation if their retention probability drops below 80%.
    """
    print(f"[ANALYTICS] Evaluating decay for user {user_id}", flush=True)
    
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
            
        print(f"[ANALYTICS] Found {len(results)} completed assessments for campaign {camp_id}.", flush=True)
        
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
                
                print(f"[ANALYTICS DEBUG] Module: {assessment.module_id} | Days: {days_elapsed} | Ret: {retention_probability}")
                
                # Save exact score to database unconditionally for charting
                score_int = int(retention_probability * 100)
                module.current_retention_score = score_int
                db_session.add(module)
                
                if retention_probability < 0.80:
                    module.requires_remediation = True
                    
            await db_session.commit()
            print(f"[ANALYTICS] DB Batch Commit Successful for campaign {camp_id}")
        except Exception as e:
            await db_session.rollback()
            logger.error(f"[ANALYTICS] DB Batch Commit Failed for campaign {camp_id}: {e}")