from datetime import datetime
from uuid import UUID

from app.schemas.common import OrmResponse, PageResponse


class AuditEventResponse(OrmResponse):
    id: UUID
    actor_id: UUID | None = None
    action: str
    entity_type: str
    entity_id: str
    timestamp: datetime
    summary: str


class AuditPageResponse(PageResponse):
    items: list[AuditEventResponse]
