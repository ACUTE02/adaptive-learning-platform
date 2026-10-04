"""POST /api/v1/monitoring/feedback: sign-in required, rate limited, bounded in size."""

from contextlib import contextmanager
from datetime import timedelta
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

import src.routers.monitoring as monitoring
import src.services.security.rate_limiting as rate_limiting
from app import app as full_app
from src.core.events.database import get_db_session
from src.security.auth import create_access_token

URL = "/api/v1/monitoring/feedback"


@pytest.fixture(autouse=True)
def isolated_limiter(monkeypatch):
    """Use the in-process limiter with clean counters; never touch a real Redis."""
    monkeypatch.setattr(rate_limiting, "_get_redis_pool_client", lambda: None)
    rate_limiting._local_hits.clear()
    monkeypatch.setattr(rate_limiting, "_redis_down_until", 0.0)
    yield
    rate_limiting._local_hits.clear()


@pytest.fixture
async def client(db, regular_user):
    full_app.dependency_overrides[get_db_session] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=full_app), base_url="http://test") as c:
        yield c
    full_app.dependency_overrides.clear()


def auth(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': user.email}, expires_delta=timedelta(minutes=10))}"}


class TestFeedbackNeedsLogin:
    async def test_anonymous_is_rejected(self, client):
        response = await client.post(URL, data={"message": "spam"})
        assert response.status_code == 401

    async def test_garbage_token_is_rejected(self, client):
        response = await client.post(URL, data={"message": "spam"}, headers={"Authorization": "Bearer nope"})
        assert response.status_code in (401, 403)

    async def test_signed_in_user_can_send_feedback(self, client, regular_user):
        response = await client.post(URL, data={"message": "great app"}, headers=auth(regular_user))
        assert response.status_code == 204

    async def test_empty_message_is_still_a_400(self, client, regular_user):
        response = await client.post(URL, data={"message": "   "}, headers=auth(regular_user))
        assert response.status_code == 400


class TestFeedbackIsRateLimited:
    async def test_eleventh_message_in_an_hour_is_refused(self, client, regular_user):
        for i in range(monitoring._FEEDBACK_LIMIT):
            r = await client.post(URL, data={"message": f"note {i}"}, headers=auth(regular_user))
            assert r.status_code == 204
        blocked = await client.post(URL, data={"message": "one too many"}, headers=auth(regular_user))
        assert blocked.status_code == 429
        assert int(blocked.headers["Retry-After"]) >= 1

    async def test_limit_is_per_user(self, client, regular_user, admin_user):
        for i in range(monitoring._FEEDBACK_LIMIT):
            await client.post(URL, data={"message": f"note {i}"}, headers=auth(regular_user))
        assert (await client.post(URL, data={"message": "x"}, headers=auth(regular_user))).status_code == 429
        assert (await client.post(URL, data={"message": "x"}, headers=auth(admin_user))).status_code == 204

    async def test_limiter_still_applies_when_redis_is_down(self, client, regular_user, monkeypatch):
        def broken():
            raise ConnectionError("redis down")

        monkeypatch.setattr(rate_limiting, "_get_redis_pool_client", broken)
        for i in range(monitoring._FEEDBACK_LIMIT):
            assert (await client.post(URL, data={"message": f"n{i}"}, headers=auth(regular_user))).status_code == 204
        assert (await client.post(URL, data={"message": "x"}, headers=auth(regular_user))).status_code == 429


class TestFeedbackSizeLimits:
    async def test_oversized_request_is_refused_before_reading_files(self, client, regular_user, monkeypatch):
        monkeypatch.setattr(monitoring, "_MAX_REQUEST_BYTES", 1000)
        response = await client.post(
            URL,
            data={"message": "big"},
            files={"attachments": ("a.txt", b"x" * 5000, "text/plain")},
            headers=auth(regular_user),
        )
        assert response.status_code == 413

    async def test_an_attachment_is_never_read_past_its_limit(self, client, regular_user, monkeypatch):
        """With Sentry active, only _MAX_ATTACHMENT_BYTES of a larger upload are forwarded."""
        monkeypatch.setattr(monitoring, "_MAX_ATTACHMENT_BYTES", 10)
        monkeypatch.setattr(monitoring, "_MAX_REQUEST_BYTES", 10_000)
        captured = []

        @contextmanager
        def fake_scope():
            yield SimpleNamespace(add_attachment=lambda bytes, filename, content_type: captured.append(len(bytes)))

        monkeypatch.setattr(monitoring.sentry_sdk, "get_client", lambda: SimpleNamespace(is_active=lambda: True))
        monkeypatch.setattr(monitoring.sentry_sdk, "new_scope", fake_scope)
        monkeypatch.setattr(monitoring.sentry_sdk, "capture_event", lambda event: None)

        # Record how much the handler asks to read: it must never ask for "everything".
        from starlette.datastructures import UploadFile

        requested = []
        real_read = UploadFile.read

        async def spying_read(self, size=-1):
            requested.append(size)
            return await real_read(self, size)

        monkeypatch.setattr(UploadFile, "read", spying_read)
        response = await client.post(
            URL,
            data={"message": "with file"},
            files={"attachments": ("big.txt", b"y" * 5000, "text/plain")},
            headers=auth(regular_user),
        )
        assert response.status_code == 204
        assert captured == [10]
        assert requested == [11], f"the upload was read with size={requested}; expected one byte past the limit"
