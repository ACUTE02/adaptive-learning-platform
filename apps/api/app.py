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
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from src.services.analytics_engine import run_knowledge_decay_job
from src.core.events.database import _async_session_factory


learnhouse_config: LearnHouseConfig = get_learnhouse_config()

# Without a configured root logger, INFO records (scheduler runs, engine
# operations, LLM timings) are silently dropped and only bare warnings print.
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
# Per-request client logs are noise and can carry request URLs.
for _noisy in ("httpx", "httpcore", "google_genai"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

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
scheduler = AsyncIOScheduler(timezone="UTC")

async def knowledge_decay_job():
    try:
        await run_knowledge_decay_job(_async_session_factory)
    except Exception:
        logging.exception("Knowledge decay job crashed")

async def start_scheduler():
    job_defaults = dict(coalesce=True, max_instances=1, replace_existing=True)
    # Every worker schedules the job; a database advisory lock inside it makes
    # sure only one of them actually runs a given pass.
    scheduler.add_job(
        knowledge_decay_job, 'cron', hour=0, minute=0,
        id="knowledge_decay", misfire_grace_time=3600, **job_defaults,
    )
    # Catch-up pass shortly after boot, so a deployment that is restarted (or
    # asleep) around midnight UTC still gets its daily evaluation.
    scheduler.add_job(
        knowledge_decay_job, 'date',
        run_date=datetime.now(timezone.utc) + timedelta(minutes=2),
        id="knowledge_decay_catchup", misfire_grace_time=600, **job_defaults,
    )
    scheduler.start()
    logging.info("Scheduler started: knowledge decay runs daily at 00:00 UTC")

async def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)

app.add_event_handler("startup", start_scheduler)
app.add_event_handler("shutdown", stop_scheduler)

# Content delivery — local only.
app.include_router(local_content_router)

app.include_router(v1_router)
app.include_router(adaptive_engine.router)


@app.get("/")
async def root():
    return {"Message": "Welcome to Abhyas ✨"}


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=learnhouse_config.hosting_config.port,
        reload=learnhouse_config.general_config.development_mode,
    )
