import asyncio
import os
import sys

# Ensure the apps/api directory is in the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'api')))
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from sqlalchemy import select, func
from src.core.events.database import _async_session_factory
from src.db.engine_models import Assessment, Campaign, CampaignModuleDB

async def test_query():
    print("Testing the conditions...", flush=True)
    async with _async_session_factory() as session:
        string_user_id = "uuayush2@gmail.com"
        
        # 1. Base Assessments
        stmt = select(func.count(Assessment.id)).join(Campaign).where(Campaign.user_id == string_user_id)
        print(f"Total Assessments for user: {(await session.execute(stmt)).scalar()}")

        # 2. Status 'completed'
        stmt = select(func.count(Assessment.id)).join(Campaign).where(Campaign.user_id == string_user_id).where(Assessment.status == 'completed')
        print(f"Completed Assessments: {(await session.execute(stmt)).scalar()}")

        # 3. Score != None
        stmt = select(func.count(Assessment.id)).join(Campaign).where(Campaign.user_id == string_user_id).where(Assessment.score != None)
        print(f"Assessments with score: {(await session.execute(stmt)).scalar()}")

        # 4. Join with CampaignModuleDB
        stmt = select(func.count(Assessment.id)).join(Campaign).join(CampaignModuleDB, Assessment.module_id == CampaignModuleDB.id).where(Campaign.user_id == string_user_id)
        print(f"Assessments joining CampaignModuleDB: {(await session.execute(stmt)).scalar()}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_query())
