"""
Regression tests for the F-02 cross-org RBAC fix.

Before the fix, ``authorization_verify_based_on_roles`` loaded every role the
user held in every org they belonged to and returned True the moment any role
granted the action. A user with (e.g.) admin rights in Org A could therefore
mutate resources in Org B simply by supplying the target resource's UUID.

These tests assert that role-based fallback only considers roles that apply
to the *target* resource's organization.

The original tests used courses as the target resource. This fork removed the
course models, so the same checks now use user groups, which resolve their
organization through the same ``get_element_organization_id`` path.
"""

from datetime import datetime
from unittest.mock import Mock

import pytest
from fastapi import Request

from src.db.roles import Role, RoleTypeEnum
from src.db.user_organizations import UserOrganization
from src.db.usergroups import UserGroup
from src.db.users import User
from src.security.rbac.rbac import authorization_verify_based_on_roles

from src.tests.conftest import ADMIN_RIGHTS


async def _mk_user(db, *, uid: int, username: str, email: str) -> User:
    u = User(
        id=uid,
        username=username,
        first_name="First",
        last_name="Last",
        email=email,
        password="x",
        user_uuid=f"user_{username}",
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


async def _mk_group(db, *, gid: int, org_id: int, uuid: str) -> UserGroup:
    g = UserGroup(
        id=gid,
        name=f"Group {gid}",
        description="x",
        org_id=org_id,
        usergroup_uuid=uuid,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return g


async def _attach_role(db, *, user_id: int, org_id: int, role_id: int) -> None:
    db.add(
        UserOrganization(
            user_id=user_id,
            org_id=org_id,
            role_id=role_id,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
    )
    await db.commit()


@pytest.fixture
def mock_request():
    return Mock(spec=Request)


class TestCrossOrgRoleFallback:
    """Cross-org isolation for role-based authorization fallback."""

    @pytest.mark.asyncio
    async def test_admin_in_org_a_cannot_update_resource_in_org_b(
        self, db, org, other_org, admin_role, mock_request
    ):
        """Alice is admin in org-A. A resource in org-B must not be writable by her."""
        alice = await _mk_user(db, uid=42, username="alice", email="alice@test.com")
        await _attach_role(db, user_id=alice.id, org_id=org.id, role_id=admin_role.id)

        org_b_group = await _mk_group(
            db, gid=100, org_id=other_org.id, uuid="usergroup_org_b"
        )

        allowed = await authorization_verify_based_on_roles(
            mock_request, alice.id, "update", org_b_group.usergroup_uuid, db
        )
        assert allowed is False, (
            "admin-in-org-A must not be granted role-based update on a resource in org-B"
        )

    @pytest.mark.asyncio
    async def test_admin_can_still_update_own_org_resource(
        self, db, org, admin_role, mock_request
    ):
        """The same admin retains her legitimate permissions inside her own org."""
        alice = await _mk_user(db, uid=43, username="alice_own", email="alice2@test.com")
        await _attach_role(db, user_id=alice.id, org_id=org.id, role_id=admin_role.id)

        own_group = await _mk_group(
            db, gid=101, org_id=org.id, uuid="usergroup_own"
        )

        allowed = await authorization_verify_based_on_roles(
            mock_request, alice.id, "update", own_group.usergroup_uuid, db
        )
        assert allowed is True

    @pytest.mark.asyncio
    async def test_user_with_no_membership_gets_denied(
        self, db, org, other_org, admin_role, mock_request
    ):
        """A user with an admin role on org-A but no membership link to org-B."""
        bob = await _mk_user(db, uid=44, username="bob", email="bob@test.com")
        await _attach_role(db, user_id=bob.id, org_id=org.id, role_id=admin_role.id)

        victim_group = await _mk_group(
            db, gid=102, org_id=other_org.id, uuid="usergroup_victim"
        )

        for action in ("read", "update", "delete"):
            allowed = await authorization_verify_based_on_roles(
                mock_request, bob.id, action, victim_group.usergroup_uuid, db
            )
            assert allowed is False, f"cross-org {action} must be denied"

    @pytest.mark.asyncio
    async def test_global_default_role_requires_target_org_membership(
        self, db, org, other_org, mock_request
    ):
        """
        A global-default role (``org_id IS NULL``) may only take effect when
        the user is also a member of the target org. Without the membership
        tether, a globally defined "editor" role could turn every user in the
        platform into a writer on every other tenant.
        """
        # Create a global (org_id=None) role with broad rights.
        global_role = Role(
            id=999,
            name="Global Default",
            org_id=None,
            role_type=RoleTypeEnum.TYPE_GLOBAL,
            role_uuid="role_global",
            rights=ADMIN_RIGHTS.model_dump(),
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
        db.add(global_role)
        await db.commit()

        # Carol holds the global role via membership in org-A only.
        carol = await _mk_user(db, uid=45, username="carol", email="carol@test.com")
        await _attach_role(db, user_id=carol.id, org_id=org.id, role_id=global_role.id)

        org_b_group = await _mk_group(
            db, gid=103, org_id=other_org.id, uuid="usergroup_global_victim"
        )

        allowed = await authorization_verify_based_on_roles(
            mock_request, carol.id, "update", org_b_group.usergroup_uuid, db
        )
        assert allowed is False

    @pytest.mark.asyncio
    async def test_placeholder_create_target_still_works(
        self, db, org, admin_role, mock_request
    ):
        """
        For top-level create placeholders (``usergroup_x``) ``target_org_id``
        is ``None``; role-based checks must still work so create flows are
        unaffected by the cross-org fix.
        """
        alice = await _mk_user(db, uid=46, username="alice_create", email="alice3@test.com")
        await _attach_role(db, user_id=alice.id, org_id=org.id, role_id=admin_role.id)

        allowed = await authorization_verify_based_on_roles(
            mock_request, alice.id, "create", "usergroup_x", db
        )
        assert allowed is True
