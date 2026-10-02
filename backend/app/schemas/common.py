from collections.abc import Sequence

from pydantic import BaseModel, ConfigDict, Field


def normalized_name(value: str) -> str:
    value = value.strip()
    if len(value) < 2:
        raise ValueError("Name must contain at least two non-whitespace characters.")
    return value


class OrmResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PageResponse(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class PageParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(25, ge=1, le=100)


def page(items: Sequence[object], page_number: int, page_size: int, total: int) -> dict[str, object]:
    return {
        "items": items,
        "page": page_number,
        "page_size": page_size,
        "total_items": total,
        "total_pages": (total + page_size - 1) // page_size,
    }
