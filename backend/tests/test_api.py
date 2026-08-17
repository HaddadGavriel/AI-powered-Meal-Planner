import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import Household, Invitation, Membership, Role, User
from app.schemas import BootstrapResponse, InvitationResponse, MemberResponse
from tests.helpers import login


def test_auth_rotation_logout_and_error_envelope(client: TestClient) -> None:
    invalid = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@mealplanner.dev", "password": "incorrect-password"},
    )
    assert invalid.status_code == 401
    assert set(invalid.json()["error"]) == {"code", "message", "details"}
    headers = login(client)
    old_cookie = client.cookies.get("meal_planner_refresh")
    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert client.cookies.get("meal_planner_refresh") != old_cookie
    replay = TestClient(client.app)
    replay.cookies.set("meal_planner_refresh", old_cookie)
    assert replay.post("/api/v1/auth/refresh").status_code == 401
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_protection_email_atomicity_and_bootstrap_boundary(client: TestClient) -> None:
    assert client.get("/api/v1/bootstrap").status_code == 401
    headers = login(client)
    collision = client.patch(
        "/api/v1/users/me", headers=headers, json={"email": "ADMIN@mealplanner.dev"}
    )
    assert collision.status_code == 409
    changed = client.patch(
        "/api/v1/users/me", headers=headers, json={"email": "NEW-owner@mealplanner.dev"}
    )
    assert changed.status_code == 200
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "owner@mealplanner.dev", "password": "mealplanner-demo"},
        ).status_code
        == 401
    )
    headers = login(client, "new-owner@mealplanner.dev")
    data = client.get("/api/v1/bootstrap", headers=headers).json()
    assert data["version"] == 2
    assert data["ingredients"] == data["recipes"] == data["plans"] == data["shoppingLists"] == []
    serialized = str(data).lower()
    assert (
        "password" not in serialized
        and "token" not in serialized
        and "acceptanceurl" not in serialized
    )


def test_roles_owner_invariant_and_promoted_login(client: TestClient) -> None:
    owner_headers = login(client)
    members = client.get("/api/v1/household/members", headers=owner_headers).json()["items"]
    owner = next(x for x in members if x["role"] == "owner")
    normal = next(x for x in members if x["role"] == "member")
    assert (
        client.patch(
            f"/api/v1/household/members/{owner['id']}",
            headers=owner_headers,
            json={"role": "member"},
        ).status_code
        == 409
    )
    promoted = client.patch(
        f"/api/v1/household/members/{normal['id']}", headers=owner_headers, json={"role": "owner"}
    )
    assert promoted.status_code == 200
    assert login(client, "member@mealplanner.dev")
    admin_headers = login(client, "admin@mealplanner.dev")
    assert (
        client.delete(f"/api/v1/household/members/{owner['id']}", headers=admin_headers).status_code
        == 403
    )


def test_invitation_rotation_revocation_acceptance_and_login(client: TestClient) -> None:
    headers = login(client)
    made = client.post(
        "/api/v1/household/invitations",
        headers=headers,
        json={"email": "Invitee@Example.com", "proposedRole": "member"},
    )
    assert made.status_code == 201 and "token" not in str(made.json()).lower()
    invitation_id = made.json()["id"]
    link1 = client.post(
        f"/api/v1/household/invitations/{invitation_id}/acceptance-link", headers=headers
    ).json()["acceptanceUrl"]
    token1 = urlparse(link1).path.rsplit("/", 1)[-1]
    link2 = client.post(
        f"/api/v1/household/invitations/{invitation_id}/acceptance-link", headers=headers
    ).json()["acceptanceUrl"]
    token2 = urlparse(link2).path.rsplit("/", 1)[-1]
    assert client.get(f"/api/v1/invitations/{token1}").status_code == 404
    assert client.get(f"/api/v1/invitations/{token2}").status_code == 200
    accepted = client.post(
        f"/api/v1/invitations/{token2}/accept",
        json={"name": "Invited Person", "password": "chosen-password"},
    )
    assert accepted.status_code == 200
    assert (
        client.post(
            f"/api/v1/invitations/{token2}/accept",
            json={"name": "Again Person", "password": "chosen-password"},
        ).status_code
        == 410
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "INVITEE@example.com", "password": "chosen-password"},
        ).status_code
        == 200
    )

    second = client.post(
        "/api/v1/household/invitations",
        headers=headers,
        json={"email": "revoked@example.com", "proposedRole": "administrator"},
    ).json()
    link = client.post(
        f"/api/v1/household/invitations/{second['id']}/acceptance-link", headers=headers
    ).json()["acceptanceUrl"]
    token = urlparse(link).path.rsplit("/", 1)[-1]
    assert (
        client.delete(f"/api/v1/household/invitations/{second['id']}", headers=headers).status_code
        == 204
    )
    assert client.get(f"/api/v1/invitations/{token}").json()["status"] == "revoked"
    assert (
        client.post(
            f"/api/v1/invitations/{token}/accept",
            json={"name": "No Person", "password": "chosen-password"},
        ).status_code
        == 410
    )


def test_audit_is_filtered_to_authenticated_household(client: TestClient) -> None:
    headers = login(client)
    events = client.get("/api/v1/audit-events?page=1&pageSize=2&action=auth.login", headers=headers)
    assert events.status_code == 200
    body = events.json()
    assert body["pageSize"] == 2
    assert all(item["action"] == "auth.login" for item in body["items"])


def test_removed_user_cannot_login_or_refresh(client: TestClient) -> None:
    member_client = TestClient(client.app)
    member_headers = login(member_client, "member@mealplanner.dev")
    assert member_headers
    owner_headers = login(client)
    member_id = next(
        row["id"]
        for row in client.get("/api/v1/household/members", headers=owner_headers).json()["items"]
        if row["email"] == "member@mealplanner.dev"
    )
    assert (
        client.delete(f"/api/v1/household/members/{member_id}", headers=owner_headers).status_code
        == 204
    )
    assert member_client.post("/api/v1/auth/refresh").status_code == 401
    assert (
        member_client.post(
            "/api/v1/auth/login",
            json={"email": "member@mealplanner.dev", "password": "mealplanner-demo"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/household/invitations",
            headers=owner_headers,
            json={"email": "member@mealplanner.dev", "proposedRole": "member"},
        ).status_code
        == 409
    )


def test_one_membership_per_user_and_cross_household_isolation(client: TestClient) -> None:
    headers = login(client)
    with SessionLocal() as db:
        owner = db.scalar(select(User).where(User.email == "owner@mealplanner.dev"))
        assert owner
        second = Household(
            name="Second Household",
            timezone="UTC",
            default_servings=2,
            updated_at=datetime.now(UTC),
        )
        db.add(second)
        db.commit()
        db.refresh(second)
        db.refresh(owner)
        db.add(
            Membership(
                household_id=second.id,
                user_id=owner.id,
                role=Role.member,
                status="active",
                joined_at=datetime.now(UTC),
                user=owner,
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        other_user = User(email="other@example.com", name="Other User", password_hash="unused")
        db.add(other_user)
        db.flush()
        other_member = Membership(
            household_id=second.id,
            user_id=other_user.id,
            role=Role.member,
            status="active",
            joined_at=datetime.now(UTC),
            user=other_user,
        )
        db.add(other_member)
        db.commit()
        other_id = other_member.id
    assert (
        client.patch(
            f"/api/v1/household/members/{other_id}", headers=headers, json={"role": "administrator"}
        ).status_code
        == 404
    )


def test_identifiers_and_response_models_match(client: TestClient) -> None:
    headers = login(client)
    me = MemberResponse.model_validate(client.get("/api/v1/users/me", headers=headers).json())
    invitation = client.post(
        "/api/v1/household/invitations",
        headers=headers,
        json={"email": "identifier@example.com", "proposedRole": "member"},
    )
    summary = InvitationResponse.model_validate(invitation.json())
    assert summary.invitedBy == me.id
    bootstrap = BootstrapResponse.model_validate(
        client.get("/api/v1/bootstrap", headers=headers).json()
    )
    assert bootstrap.dietaryProfiles
    assert {profile.memberId for profile in bootstrap.dietaryProfiles} <= {
        member.id for member in bootstrap.members
    }
    assert all(
        event.actorId is None or event.actorId in {m.id for m in bootstrap.members}
        for event in bootstrap.auditEvents
    )


def test_expired_invitation_filters_and_rejects_mutations(client: TestClient) -> None:
    headers = login(client)
    invitation_id = client.post(
        "/api/v1/household/invitations",
        headers=headers,
        json={"email": "expired@example.com", "proposedRole": "member"},
    ).json()["id"]
    link = client.post(
        f"/api/v1/household/invitations/{invitation_id}/acceptance-link", headers=headers
    ).json()["acceptanceUrl"]
    token = urlparse(link).path.rsplit("/", 1)[-1]
    with SessionLocal() as db:
        row = db.get(Invitation, uuid.UUID(invitation_id))
        assert row
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert client.get(f"/api/v1/invitations/{token}").json()["status"] == "expired"
    expired = client.get("/api/v1/household/invitations?status=expired", headers=headers).json()[
        "items"
    ]
    assert any(row["id"] == invitation_id for row in expired)
    assert (
        client.post(
            f"/api/v1/household/invitations/{invitation_id}/resend", headers=headers
        ).status_code
        == 410
    )
    assert (
        client.delete(f"/api/v1/household/invitations/{invitation_id}", headers=headers).status_code
        == 410
    )
    assert (
        client.post(
            f"/api/v1/invitations/{token}/accept",
            json={"name": "Expired User", "password": "chosen-password"},
        ).status_code
        == 410
    )


@pytest.mark.parametrize("name", ["  ", "\t\n"])
def test_whitespace_names_are_rejected(client: TestClient, name: str) -> None:
    headers = login(client)
    assert client.patch("/api/v1/users/me", headers=headers, json={"name": name}).status_code == 422
    assert (
        client.patch("/api/v1/household", headers=headers, json={"name": name}).status_code == 422
    )
    invitation_id = client.post(
        "/api/v1/household/invitations",
        headers=headers,
        json={"email": f"whitespace-{len(name)}@example.com", "proposedRole": "member"},
    ).json()["id"]
    link = client.post(
        f"/api/v1/household/invitations/{invitation_id}/acceptance-link", headers=headers
    ).json()["acceptanceUrl"]
    token = urlparse(link).path.rsplit("/", 1)[-1]
    assert (
        client.post(
            f"/api/v1/invitations/{token}/accept",
            json={"name": name, "password": "chosen-password"},
        ).status_code
        == 422
    )


def test_invalid_household_timezone_is_rejected(client: TestClient) -> None:
    headers = login(client)
    assert (
        client.patch(
            "/api/v1/household", headers=headers, json={"timezone": "Mars/Olympus"}
        ).status_code
        == 422
    )
