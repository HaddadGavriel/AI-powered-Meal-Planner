from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.users import MemberResponse


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class AuthResponse(BaseModel):
    access_token: str
    expires_at: datetime
    user: MemberResponse
