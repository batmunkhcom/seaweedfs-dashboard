from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class UserSession(BaseModel):
    username: str
    role: str


class LoginResponse(BaseModel):
    user: UserSession
    csrf_token: str


class CsrfTokenResponse(BaseModel):
    token: str
