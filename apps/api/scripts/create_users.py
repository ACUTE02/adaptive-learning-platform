#!/usr/bin/env python3
"""Create the first admin and one demo student in the default organization.

Idempotent: an account whose email already exists is left untouched.
Everything comes from environment variables, nothing is hardcoded:

    LEARNHOUSE_INITIAL_ADMIN_EMAIL     LEARNHOUSE_INITIAL_ADMIN_PASSWORD
    DEMO_STUDENT_EMAIL                 DEMO_STUDENT_PASSWORD
    LEARNHOUSE_INITIAL_ORG_SLUG        (optional, default "default")

Run inside the api container (see DEPLOY.md):
    docker compose -f docker-compose.prod.yml exec api uv run python scripts/create_users.py
"""

import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine
from sqlmodel import Session, select

from config.config import get_learnhouse_config
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.security.security import security_hash_password
from src.services.security.password_validation import validate_password_complexity

STUDENT_ROLE_ID = 4  # same role a normal signup gets (src/services/users/users.py)


def ensure_user(db: Session, org: Organization, *, label: str, email: str | None,
                password: str | None, username: str, role_id: int, superadmin: bool) -> bool:
    if not email or not password:
        print(f"[skip] {label}: email or password env variable is empty")
        return False

    if db.exec(select(User).where(User.email == email)).first():
        print(f"[ok]   {label}: {email} already exists, left unchanged")
        return True
    if db.exec(select(User).where(User.username == username)).first():
        print(f"[fail] {label}: username '{username}' is already used by another account")
        return False

    check = validate_password_complexity(password)
    if not check.is_valid:
        print(f"[fail] {label}: password is too weak: {'; '.join(check.errors)}")
        return False

    now = str(datetime.now())
    user = User(
        username=username,
        first_name="",
        last_name="",
        email=email,
        password=security_hash_password(password),
        user_uuid=f"user_{uuid.uuid4()}",
        email_verified=True,
        email_verified_at=datetime.now(timezone.utc).isoformat(),
        signup_method="email",
        is_superadmin=superadmin,
        creation_date=now,
        update_date=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(UserOrganization(user_id=user.id, org_id=org.id, role_id=role_id,
                            creation_date=now, update_date=now))
    db.commit()
    print(f"[new]  {label}: {email} created")
    return True


def main() -> int:
    cfg = get_learnhouse_config()
    engine = create_engine(cfg.database_config.sql_connection_string, pool_pre_ping=True)  # type: ignore[arg-type]
    slug = os.environ.get("LEARNHOUSE_INITIAL_ORG_SLUG", "default").lower()

    with Session(engine) as db:
        org = db.exec(select(Organization).where(Organization.slug == slug)).first()
        if not org:
            print(f"[fail] organization '{slug}' not found. Start the api once first (it creates it).")
            return 1
        ok_admin = ensure_user(
            db, org, label="admin",
            email=os.environ.get("LEARNHOUSE_INITIAL_ADMIN_EMAIL"),
            password=os.environ.get("LEARNHOUSE_INITIAL_ADMIN_PASSWORD"),
            username="admin", role_id=ADMIN_ROLE_ID, superadmin=True,
        )
        ok_student = ensure_user(
            db, org, label="demo student",
            email=os.environ.get("DEMO_STUDENT_EMAIL"),
            password=os.environ.get("DEMO_STUDENT_PASSWORD"),
            username="demo_student", role_id=STUDENT_ROLE_ID, superadmin=False,
        )
    return 0 if (ok_admin and ok_student) else 1


if __name__ == "__main__":
    sys.exit(main())
