"""Production guards: unsafe collab key refuses to start; API docs are off in production."""

import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

import src.core.events.events as events_module
from src.core import production_guards as guards
from src.core.production_guards import (
    UnsafeProductionConfig,
    api_docs_enabled,
    is_production_mode,
    validate_production_config,
)

API_DIR = Path(__file__).resolve().parents[3]
GOOD_KEY = "k" * 48


@pytest.fixture
def env(monkeypatch):
    """Start from a clean environment; the suite itself runs with TESTING=true."""
    for name in ("TESTING", "ENVIRONMENT", "LEARNHOUSE_ENV", "LEARNHOUSE_ENABLE_API_DOCS", "COLLAB_INTERNAL_KEY"):
        monkeypatch.delenv(name, raising=False)

    def set_dev_flag(value):
        cfg = SimpleNamespace(general_config=SimpleNamespace(development_mode=value))
        monkeypatch.setattr("config.config.get_learnhouse_config", lambda: cfg)

    set_dev_flag(False)
    return SimpleNamespace(set=monkeypatch.setenv, dev_flag=set_dev_flag)


class TestProductionDetection:
    def test_test_suite_is_never_production(self, env):
        env.set("TESTING", "true")
        env.set("ENVIRONMENT", "production")
        assert is_production_mode() is False

    @pytest.mark.parametrize("value", ["production", "prod", "PRODUCTION"])
    def test_environment_production(self, env, value):
        env.set("ENVIRONMENT", value)
        assert is_production_mode() is True

    @pytest.mark.parametrize("value", ["development", "dev", "local", "test"])
    def test_environment_development(self, env, value):
        env.set("ENVIRONMENT", value)
        env.dev_flag(False)  # the explicit ENVIRONMENT wins over the flag
        assert is_production_mode() is False

    def test_undeclared_follows_the_development_mode_flag(self, env):
        env.dev_flag(True)
        assert is_production_mode() is False
        env.dev_flag(False)
        assert is_production_mode() is True


class TestCollabKeyGuard:
    @pytest.mark.parametrize("key", [None, "", "   ", "dev-collab-internal-key-change-in-prod", "REPLACE_WITH_A_NEW_RANDOM_KEY", "yahan-naya-random-key"])
    def test_production_refuses_empty_default_or_placeholder_key(self, env, key):
        env.set("ENVIRONMENT", "production")
        if key is not None:
            env.set("COLLAB_INTERNAL_KEY", key)
        with pytest.raises(UnsafeProductionConfig) as raised:
            validate_production_config()
        assert "COLLAB_INTERNAL_KEY" in str(raised.value)
        assert "Refusing to start in production" in str(raised.value)

    def test_error_message_never_contains_the_rejected_value(self, env):
        env.set("ENVIRONMENT", "production")
        env.set("COLLAB_INTERNAL_KEY", "dev-collab-internal-key-change-in-prod")
        with pytest.raises(UnsafeProductionConfig) as raised:
            validate_production_config()
        assert "dev-collab-internal-key-change-in-prod" not in str(raised.value)

    def test_production_accepts_a_real_key(self, env):
        env.set("ENVIRONMENT", "production")
        env.set("COLLAB_INTERNAL_KEY", GOOD_KEY)
        validate_production_config()

    @pytest.mark.parametrize("environment", ["development", "dev", "local"])
    def test_development_allows_the_default_and_even_no_key(self, env, environment):
        env.set("ENVIRONMENT", environment)
        env.set("COLLAB_INTERNAL_KEY", "dev-collab-internal-key-change-in-prod")
        validate_production_config()
        env.set("COLLAB_INTERNAL_KEY", "")
        validate_production_config()

    def test_development_mode_flag_allows_the_default(self, env):
        env.dev_flag(True)
        env.set("COLLAB_INTERNAL_KEY", "dev-collab-internal-key-change-in-prod")
        validate_production_config()

    async def test_startup_aborts_before_touching_the_database(self, env, monkeypatch):
        env.set("ENVIRONMENT", "production")
        env.set("COLLAB_INTERNAL_KEY", "dev-collab-internal-key-change-in-prod")
        touched = []

        async def fake_connect(app):
            touched.append("db")

        monkeypatch.setattr(events_module, "connect_to_db", fake_connect)
        monkeypatch.setattr(events_module, "get_learnhouse_config", lambda: SimpleNamespace())
        start = events_module.startup_app(SimpleNamespace())
        with pytest.raises(UnsafeProductionConfig):
            await start()
        assert touched == [], "the database was opened even though the configuration is unsafe"


class TestApiDocsSwitch:
    def test_off_in_production_on_in_development(self, env):
        env.set("ENVIRONMENT", "production")
        assert api_docs_enabled() is False
        env.set("ENVIRONMENT", "development")
        assert api_docs_enabled() is True

    def test_explicit_flag_overrides_both_ways(self, env):
        env.set("ENVIRONMENT", "production")
        env.set("LEARNHOUSE_ENABLE_API_DOCS", "true")
        assert api_docs_enabled() is True
        env.set("ENVIRONMENT", "development")
        env.set("LEARNHOUSE_ENABLE_API_DOCS", "false")
        assert api_docs_enabled() is False


_PROBE = """
import asyncio, json
import httpx
import app

async def main():
    out = {"docs_url": app.app.docs_url, "redoc_url": app.app.redoc_url, "openapi_url": app.app.openapi_url}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app.app), base_url="http://t") as c:
        for path in ("/docs", "/redoc", "/openapi.json", "/api/v1/engine/health"):
            out[path] = (await c.get(path)).status_code
    print("PROBE" + json.dumps(out))

asyncio.run(main())
"""


def _run_real_app(**extra_env):
    env = {k: v for k, v in os.environ.items() if k not in ("TESTING", "ENVIRONMENT", "LEARNHOUSE_ENV", "LEARNHOUSE_ENABLE_API_DOCS")}
    env.update(
        LEARNHOUSE_AUTH_JWT_SECRET_KEY="probe-secret-probe-secret-probe-secret-1",
        LEARNHOUSE_SQL_CONNECTION_STRING="postgresql://probe:probe@127.0.0.1:1/probe",
        LEARNHOUSE_DEVELOPMENT_MODE="false",
        GEMINI_API_KEY="probe",
        **extra_env,
    )
    result = subprocess.run([sys.executable, "-c", _PROBE], cwd=API_DIR, env=env, capture_output=True, text=True, timeout=120)
    line = next((l for l in result.stdout.splitlines() if l.startswith("PROBE")), None)
    assert line, f"probe failed: {result.stderr[-800:]}"
    return json.loads(line[5:])


class TestRealApplication:
    def test_production_serves_no_docs_or_schema(self):
        out = _run_real_app(ENVIRONMENT="production")
        assert (out["docs_url"], out["redoc_url"], out["openapi_url"]) == (None, None, None)
        assert out["/docs"] == out["/redoc"] == out["/openapi.json"] == 404
        assert out["/api/v1/engine/health"] == 200, "the API itself must still work"

    def test_development_serves_docs(self):
        out = _run_real_app(ENVIRONMENT="development")
        assert out["/docs"] == out["/redoc"] == out["/openapi.json"] == 200
