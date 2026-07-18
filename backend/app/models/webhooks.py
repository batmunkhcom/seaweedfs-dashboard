from pydantic import BaseModel, Field
from typing import Optional


class WebhookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    platform: str = Field(default="generic")
    url: str = Field(..., min_length=5)
    events: list[str] = Field(default_factory=list)
    secret: str = Field(default="")


class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    platform: Optional[str] = None
    url: Optional[str] = None
    events: Optional[list[str]] = None
    secret: Optional[str] = None


class WebhookResponse(BaseModel):
    id: int
    name: str
    platform: str
    url: str
    events: list[str]
    enabled: bool
    created_at: str
    updated_at: Optional[str] = None


class WebhookDelivery(BaseModel):
    id: int
    webhook_id: int
    event: str
    status: str
    response_code: Optional[int] = None
    error: str
    duration_ms: Optional[int] = None
    created_at: str


class WebhookTestResult(BaseModel):
    ok: bool
    status_code: Optional[int] = None
    response: str = ""
    error: str = ""
    duration_ms: int = 0


class WebhookPayload(BaseModel):
    event: str
    webhook_id: int
    url: str
    secret: str
    payload: dict
