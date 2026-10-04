"""Regression: organization invite endpoints need a signed-in user with the right role.

Before the fix, ``GET /api/v1/orgs/{org_id}/invites/users`` was guarded by
``rbac_check(..., "read")``. ``rbac_check`` treats "read" on an organization as
public, so a caller with no token at all received the e-mail address, creator
and expiry of every pending invitee.

These tests run the real application (real routers, real JWT dependency chain);
only the database session and Redis are replaced.
"""

import json
from datetime import timedelta
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

import src.services.orgs.invites as invites_service
import src.services.orgs.users as users_service
from app import app as full_app
from src.core.events.database import get_db_session
from src.security.auth import create_access_token

INVITEE_EMAIL = "pending-invitee@example.com"
ORG_UUID = "org_test"  # from the shared `org` fixture


class FakeRedis:
    """Just enough Redis for the invite services."""

    def __init__(self):
        self.store = {
            f"invited_user:{INVITEE_EMAIL}:org:{ORG_UUID}": json.dumps(
                {"email": INVITEE_EMAIL, "org_id": 1, "pending": True, "created_by": "user_admin"}
            ).encode("utf-8"),
        }

    def scan_iter(self, match=None, count=None):
        import fnmatch
        return iter([k for k in self.store if fnmatch.fnmatch(k, match)])

    def get(self, key):
        return self.store.get(key)

    def setex(self, key, ttl, value):
        self.store[key] = value if isinstance(value, bytes) else str(value).encode()

    def set(self, key, value, *a, **k):
        self.store[key] = value if isinstance(value, bytes) else str(value).encode()

    def delete(self, *keys):
        for k in keys:
            self.store.pop(k, None)

    def exists(self, key):
        return key in self.store


@pytest.fixture
def fake_redis(monkeypatch):
    fake = FakeRedis()
    cfg = SimpleNamespace(redis_config=SimpleNamespace(redis_connection_string="redis://fake"))
    monkeypatch.setattr(users_service, "get_learnhouse_config", lambda: cfg)
    monkeypatch.setattr(invites_service, "get_learnhouse_config", lambda: cfg)
    monkeypatch.setattr(users_service.redis.Redis, "from_url", staticmethod(lambda *a, **k: fake))
    monkeypatch.setattr(invites_service, "_get_redis", lambda *a, **k: fake)
    return fake


@pytest.fixture
async def client(db, org, admin_user, regular_user, fake_redis):
    full_app.dependency_overrides[get_db_session] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=full_app), base_url="http://test") as c:
        yield c
    full_app.dependency_overrides.clear()


def bearer(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': user.email}, expires_delta=timedelta(minutes=10))}"}


INVITE_ROUTES = [
    ("GET", "/api/v1/orgs/1/invites/users", None),
    ("DELETE", f"/api/v1/orgs/1/invites/users/{INVITEE_EMAIL}", None),
    ("POST", f"/api/v1/orgs/1/invites/users/batch?emails={INVITEE_EMAIL}", None),
    ("GET", "/api/v1/orgs/1/invites", None),
    ("POST", "/api/v1/orgs/1/invites", None),
    ("DELETE", "/api/v1/orgs/1/invites/someinvitecode", None),
]


class TestInviteListedUsers:
    async def test_anonymous_cannot_list_invited_users(self, client):
        response = await client.get("/api/v1/orgs/1/invites/users")
        assert response.status_code in (401, 403)
        assert INVITEE_EMAIL not in response.text

    async def test_ordinary_member_cannot_list_invited_users(self, client, regular_user):
        response = await client.get("/api/v1/orgs/1/invites/users", headers=bearer(regular_user))
        assert response.status_code == 403
        assert INVITEE_EMAIL not in response.text

    async def test_org_admin_can_list_invited_users(self, client, admin_user):
        response = await client.get("/api/v1/orgs/1/invites/users", headers=bearer(admin_user))
        assert response.status_code == 200
        assert [i["email"] for i in response.json()] == [INVITEE_EMAIL]

    async def test_garbage_token_is_not_treated_as_anonymous_access(self, client):
        response = await client.get("/api/v1/orgs/1/invites/users", headers={"Authorization": "Bearer not-a-token"})
        assert response.status_code in (401, 403)
        assert INVITEE_EMAIL not in response.text


class TestAllInviteRoutesNeedAnAdmin:
    @pytest.mark.parametrize("method,path,body", INVITE_ROUTES)
    async def test_anonymous_is_rejected(self, client, fake_redis, method, path, body):
        before = dict(fake_redis.store)
        response = await client.request(method, path, json=body)
        assert response.status_code in (401, 403), f"{method} {path} answered {response.status_code} without a login"
        assert INVITEE_EMAIL not in response.text
        assert fake_redis.store == before, "an anonymous request changed invite data"

    @pytest.mark.parametrize("method,path,body", INVITE_ROUTES)
    async def test_ordinary_member_is_rejected(self, client, fake_redis, regular_user, method, path, body):
        before = dict(fake_redis.store)
        response = await client.request(method, path, json=body, headers=bearer(regular_user))
        assert response.status_code == 403, f"{method} {path} answered {response.status_code} for a non-admin"
        assert fake_redis.store == before, "a non-admin request changed invite data"
