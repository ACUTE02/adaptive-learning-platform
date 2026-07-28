import asyncio
import logging
from typing import Callable
from fastapi import FastAPI
from config.config import LearnHouseConfig, get_learnhouse_config
from src.core.events.autoinstall import auto_install
from src.core.events.content import check_content_directory
from src.core.events.database import close_database, connect_to_db
from src.core.events.logs import create_logs_dir
from src.core.ee_hooks import run_ee_startup

logger = logging.getLogger(__name__)




async def _reconcile_packs():
    """Reconcile Redis pack credits with DB state on startup."""
    try:
        from src.core.events.database import _async_session_factory
        from src.services.packs.packs import reconcile_pack_credits
        async with _async_session_factory() as db_session:
            result = await reconcile_pack_credits(db_session)
            logger.info("Pack reconciliation on startup: %s", result)
    except Exception as e:
        logger.warning("Pack reconciliation skipped (non-fatal): %s", e)


def startup_app(app: FastAPI) -> Callable:
    async def start_app() -> None:
        # Get LearnHouse Config
        learnhouse_config: LearnHouseConfig = get_learnhouse_config()
        app.learnhouse_config = learnhouse_config  # type: ignore

        # Connect to database
        await connect_to_db(app)

        # Create logs directory
        await create_logs_dir()

        # Create content directory
        await check_content_directory()

        # Check if auto-installation is needed
        await auto_install()

        # Reconcile pack credits (Redis ↔ DB)
        await _reconcile_packs()



        # Start Enterprise Edition Startup tasks if available
        run_ee_startup(app)

    return start_app


def shutdown_app(app: FastAPI) -> Callable:
    async def close_app() -> None:

        # Wait for in-flight webhook deliveries before closing the HTTP client
        from src.services.webhooks.dispatch import close_webhook_client, _background_tasks as _webhook_tasks
        if _webhook_tasks:  # pragma: no cover
            await asyncio.gather(*list(_webhook_tasks), return_exceptions=True)
        await close_webhook_client()
        await close_database(app)

    return close_app
