"""Concurrency tests for the adaptive engine that need real PostgreSQL.

Row locks and advisory locks do not exist in SQLite, so these are skipped
unless ENGINE_TEST_PG_URL points at a disposable database, e.g.

    ENGINE_TEST_PG_URL=postgresql+asyncpg://user:pass@127.0.0.1:55432/alp_audit

Only the adaptive-engine tables are created, and they are dropped afterwards.
"""

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

import src.routers.adaptive_engine as ae
import src.services.analytics_engine as analytics_engine
from src.core.events.database import get_db_session
from src.db.engine_models import (
    Assessment,
    AssessmentStatus,
    Campaign,
    CampaignModuleDB,
    EvaluationLog,
    ModuleStatus,
    StudentRating,
)
from src.db.users import PublicUser
from src.models import AITutoringSession
from src.security.api_token_utils import get_authenticated_non_api_token_user
from src.services.analytics_engine import run_knowledge_decay_job

PG_URL = os.getenv("ENGINE_TEST_PG_URL")
pytestmark = pytest.mark.skipif(not PG_URL, reason="ENGINE_TEST_PG_URL not set")

ALICE = PublicUser(id=201, username="alice", first_name="A", last_name="L", email="alice-pg@test.com", user_uuid="user_alice_pg")
ENGINE_TABLES = [
    m.__table__ for m in (Campaign, CampaignModuleDB, Assessment, StudentRating, EvaluationLog, AITutoringSession)
]


@pytest.fixture
async def factory():
    # The SQLite fixtures in conftest remap JSONB -> JSON on the shared metadata; put it back.
    Assessment.__table__.c.exam_data.type = JSONB()
    engine = create_async_engine(PG_URL, pool_size=20, max_overflow=10)
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: SQLModel.metadata.drop_all(c, tables=ENGINE_TABLES))
        await conn.run_sync(lambda c: SQLModel.metadata.create_all(c, tables=ENGINE_TABLES))
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Open the pooled connections up front. With a cold pool, connection setup
    # staggers the requests and hides the races these tests exist to catch.
    async def _warm():
        async with session_factory() as s:
            await s.execute(text("SELECT pg_sleep(0.2)"))
    await asyncio.gather(*[_warm() for _ in range(12)])

    yield session_factory
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: SQLModel.metadata.drop_all(c, tables=ENGINE_TABLES))
    await engine.dispose()


@pytest.fixture
async def client(factory, monkeypatch):
    app = FastAPI()
    app.include_router(ae.router)

    async def _db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = _db
    app.dependency_overrides[get_authenticated_non_api_token_user] = lambda: ALICE
    monkeypatch.setattr(ae, "get_redis_client", lambda: None)
    monkeypatch.setitem(ae.RATE_LIMITS, "campaign", (1000, 3600))
    monkeypatch.setitem(ae.RATE_LIMITS, "assessment", (1000, 3600))
    ae._local_hits.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def _questions(n=50):
    return [{"question": f"Q{i}?", "options": [f"A{i}", f"B{i}", f"C{i}", f"D{i}"], "correct_answer": f"A{i}"} for i in range(n)]


@pytest.fixture
def llm(monkeypatch):
    """A model that takes a moment to answer, so concurrent requests really overlap."""
    async def fake(prompt, *, timeout, op, json_mode=False):
        await asyncio.sleep(0.2)
        if op == "campaign":
            return json.dumps({"campaign_name": "C", "modules": [
                {"title": f"M{i}", "description": "d", "teaching_prompt": "p", "subtopics": ["a", "b", "c"]} for i in range(5)
            ]})
        if op == "assessment":
            return json.dumps({"questions": _questions()})
        return json.dumps({"teaching_prompt": "simpler", "subtopics": ["a", "b", "c"]})

    monkeypatch.setattr(ae, "_call_llm", fake)


async def _seed(factory, n_campaigns=1, running=False):
    ids = []
    async with factory() as s:
        for i in range(n_campaigns):
            c = Campaign(user_id=ALICE.email, title=f"c{i}", syllabus_text="s")
            s.add(c)
            await s.flush()
            m = CampaignModuleDB(campaign_id=c.id, title="Module 1", description="d", teaching_prompt="p",
                                 subtopics=json.dumps(["a"]), status=ModuleStatus.ACTIVE, order_index=0)
            s.add(m)
            await s.flush()
            a_id = None
            if running:
                a = Assessment(campaign_id=c.id, module_id=m.id, type="module_quiz", status=AssessmentStatus.IN_PROGRESS,
                               total_marks=50, exam_data={"questions": _questions(), "started_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat()})
                s.add(a)
                await s.flush()
                a_id = a.id
            ids.append((c.id, m.id, a_id))
        await s.commit()
    return ids


async def _count(factory, model, *where):
    async with factory() as s:
        return (await s.execute(select(func.count()).select_from(model).where(*where))).scalar_one()


async def test_campaign_limit_cannot_be_raced(client, factory, llm):
    """Eight simultaneous creations from a user holding 2 of 3 campaigns must yield exactly one."""
    await _seed(factory, n_campaigns=2)
    responses = await asyncio.gather(*[
        client.post("/api/v1/engine/roadmap/generate", json={"syllabus_text": f"topic {i}"}) for i in range(8)
    ])
    codes = sorted(r.status_code for r in responses)
    assert codes == [200] + [400] * 7
    assert await _count(factory, Campaign) == ae.MAX_CAMPAIGNS_PER_USER
    # no orphans: every campaign has modules
    async with factory() as s:
        empty = (await s.execute(
            select(Campaign.id).outerjoin(CampaignModuleDB).group_by(Campaign.id).having(func.count(CampaignModuleDB.id) == 0)
        )).all()
    assert empty == []


async def test_concurrent_submissions_grade_once(client, factory, llm):
    [(_, module_id, assessment_id)] = await _seed(factory, running=True)
    wrong = {f"q_{i}": f"B{i}" for i in range(50)}
    responses = await asyncio.gather(*[
        client.post(f"/api/v1/engine/assessments/{assessment_id}/submit", json={"answers": wrong}) for _ in range(6)
    ])
    assert sorted(r.status_code for r in responses) == [200] + [409] * 5
    assert await _count(factory, CampaignModuleDB, CampaignModuleDB.is_remediation == True) == 1
    assert await _count(factory, Assessment) == 2  # the graded one + the remediation placeholder


async def test_concurrent_submit_and_cancel_apply_only_one(client, factory, llm):
    [(_, _, assessment_id)] = await _seed(factory, running=True)
    right = {f"q_{i}": f"A{i}" for i in range(50)}
    submit, cancel = await asyncio.gather(
        client.post(f"/api/v1/engine/assessments/{assessment_id}/submit", json={"answers": right}),
        client.post(f"/api/v1/engine/assessments/{assessment_id}/cancel"),
    )
    assert sorted([submit.status_code, cancel.status_code]) == [200, 409]
    async with factory() as s:
        a = await s.get(Assessment, assessment_id)
    if submit.status_code == 200:
        assert (a.status, a.score, a.cancelled_count) == (AssessmentStatus.COMPLETED, 50, 0)
    else:
        assert (a.status, a.score, a.cancelled_count) == (AssessmentStatus.CANCELLED, 0, 1)


async def test_concurrent_starts_create_one_attempt(client, factory, llm):
    [(_, module_id, _)] = await _seed(factory)
    responses = await asyncio.gather(*[
        client.post(f"/api/v1/engine/assessments/{module_id}/start") for _ in range(5)
    ])
    assert [r.status_code for r in responses] == [200] * 5
    assert len({r.json()["id"] for r in responses}) == 1
    assert await _count(factory, Assessment, Assessment.module_id == module_id) == 1
    assert all("correct_answer" not in r.text for r in responses)


async def test_exam_data_round_trips_through_jsonb(client, factory, llm):
    [(_, module_id, _)] = await _seed(factory)
    started = (await client.post(f"/api/v1/engine/assessments/{module_id}/start")).json()
    right = {f"q_{i}": f"A{i}" for i in range(50)}
    graded = await client.post(f"/api/v1/engine/assessments/{started['id']}/submit", json={"answers": right})
    assert (graded.json()["score"], graded.json()["passed"]) == (50, True)


async def test_campaign_delete_cascades(client, factory, llm):
    [(campaign_id, _, _)] = await _seed(factory, running=True)
    assert (await client.delete(f"/api/v1/engine/campaigns/{campaign_id}")).status_code == 200
    assert await _count(factory, CampaignModuleDB) == 0
    assert await _count(factory, Assessment) == 0


async def test_decay_job_runs_once_across_workers(factory, monkeypatch):
    """Four 'workers' firing the daily job at the same instant: one runs, three skip."""
    monkeypatch.delenv("DECAY_EXCLUDED_USERS", raising=False)
    [(campaign_id, module_id, _)] = await _seed(factory)
    old = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=10)
    async with factory() as s:
        s.add(Assessment(campaign_id=campaign_id, module_id=module_id, type="module_quiz",
                         status=AssessmentStatus.COMPLETED, score=50, total_marks=50, updated_at=old))
        m = await s.get(CampaignModuleDB, module_id)
        m.status = ModuleStatus.COMPLETED
        await s.commit()

    real = analytics_engine.evaluate_user_decay

    async def slow(session, user_key):
        await asyncio.sleep(0.3)  # keep the lock held long enough for the others to collide
        return await real(session, user_key)

    monkeypatch.setattr(analytics_engine, "evaluate_user_decay", slow)
    results = await asyncio.gather(*[run_knowledge_decay_job(factory) for _ in range(4)])
    assert sorted(r["ran"] for r in results) == [False, False, False, True]
    async with factory() as s:
        module = await s.get(CampaignModuleDB, module_id)
    assert (module.requires_remediation, module.current_retention_score) == (True, 36)

    # the lock is released afterwards: the next day's run is not blocked
    assert (await run_knowledge_decay_job(factory))["ran"] is True
