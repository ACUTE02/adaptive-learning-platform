#   _                          _   _
#  | |    ___  __ _ _ __ _ __ | | | | ___  _   _ ___  ___
#  | |   / _ \/ _` | '__| '_ \| |_| |/ _ \| | | / __|/ _ \
#  | |__|  __/ (_| | |  | | | |  _  | (_) | |_| \__ \  __/
#  |_____\___|\__,_|_|  |_| |_|_| |_|\___/ \__,_|___/\___|
#
#  LearnHouse · open-source learning platform · FastAPI entrypoint
#
#  ↳ learnhouse.app · github.com/learnhouse/learnhouse
#  ↳ Created and maintained by @swve © 2022–present

import logging

import uvicorn
import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware

from config.config import LearnHouseConfig, get_learnhouse_config
from src.core.ee_hooks import register_ee_middlewares
from src.core.events.events import shutdown_app, startup_app
from src.core.middleware.cors import configure_cors
from src.router import v1_router

from src.routers.local_content import router as local_content_router
from src.routers import adaptive_engine
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from src.services.analytics_engine import evaluate_user_decay
from src.core.events.database import _async_session_factory
from src.db.users import User
from sqlmodel import select


learnhouse_config: LearnHouseConfig = get_learnhouse_config()

if learnhouse_config.general_config.sentry_config.dsn:
    sentry_sdk.init(
        dsn=learnhouse_config.general_config.sentry_config.dsn,
        environment=learnhouse_config.general_config.env,
        send_default_pii=False,
        enable_logs=True,
        traces_sample_rate=1.0 if learnhouse_config.general_config.development_mode else 0.3,
        profile_session_sample_rate=1.0 if learnhouse_config.general_config.development_mode else 0.1,
        profile_lifecycle="trace",
        integrations=[
            LoggingIntegration(
                level=logging.INFO,
                event_level=logging.ERROR,
            ),
        ],
    )

app = FastAPI(
    title=learnhouse_config.site_name,
    description=learnhouse_config.site_description,
    docs_url="/docs",
    redoc_url="/redoc",
    version="1.2.3",
)

# Middleware
configure_cors(app)
app.add_middleware(GZipMiddleware, minimum_size=1000)
register_ee_middlewares(app)

# Lifecycle
app.add_event_handler("startup", startup_app(app))
app.add_event_handler("shutdown", shutdown_app(app))

# APScheduler Background Jobs
scheduler = AsyncIOScheduler()

async def run_knowledge_decay_job():
    logging.info("Starting midnight knowledge decay job for all users...")
    async with _async_session_factory() as session:
        statement = select(User.email).where(User.email != 'admin@school.dev')
        users = (await session.execute(statement)).scalars().all()
        await session.rollback() # Explicitly close transaction to free PgBouncer connection
        
    for user_email in users:
        try:
            async with _async_session_factory() as user_session:
                await evaluate_user_decay(user_session, user_email)
        except Exception as e:
            logging.error(f"Error evaluating decay for user {user_email}: {e}")

async def start_scheduler():
    scheduler.add_job(run_knowledge_decay_job, 'interval', hours=24)
    scheduler.start()
    print("[SCHEDULER] APScheduler started successfully. Job will run every 24 hours.", flush=True)

async def stop_scheduler():
    scheduler.shutdown()

app.add_event_handler("startup", start_scheduler)
app.add_event_handler("shutdown", stop_scheduler)

# Content delivery — local only.
app.include_router(local_content_router)

app.include_router(v1_router)
app.include_router(adaptive_engine.router)


@app.get("/")
async def root():
    return {"Message": "Welcome to LearnHouse ✨"}


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=learnhouse_config.hosting_config.port,
        reload=learnhouse_config.general_config.development_mode,
    )
