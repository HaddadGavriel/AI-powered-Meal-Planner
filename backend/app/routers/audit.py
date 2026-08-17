import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api_support import (
    audit_json,
    current_membership,
)
from app.database import get_db
from app.models import (
    AuditEvent,
    Membership,
)
from app.schemas import (
    AuditPageResponse,
    page,
)

router = APIRouter()


@router.get("/audit-events", response_model=AuditPageResponse, response_model_exclude_none=True)
def audit_events(
    page_number: int = Query(1, alias="page", ge=1),
    page_size: int = Query(25, alias="pageSize", ge=1, le=100),
    actor_id: uuid.UUID | None = Query(None, alias="actorId"),
    action: str | None = None,
    entity_type: str | None = Query(None, alias="entityType"),
    date_from: datetime | None = Query(None, alias="from"),
    date_to: datetime | None = Query(None, alias="to"),
    member: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    query = select(AuditEvent).where(AuditEvent.household_id == member.household_id)
    if actor_id:
        query = query.where(AuditEvent.actor_id == actor_id)
    if action:
        query = query.where(AuditEvent.action == action)
    if entity_type:
        query = query.where(AuditEvent.entity_type == entity_type)
    if date_from:
        query = query.where(AuditEvent.timestamp >= date_from)
    if date_to:
        query = query.where(AuditEvent.timestamp <= date_to)
    rows = list(
        db.scalars(
            query.order_by(AuditEvent.timestamp.desc())
            .offset((page_number - 1) * page_size)
            .limit(page_size)
        )
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    return page([audit_json(x) for x in rows], page_number, page_size, total)
