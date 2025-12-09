"""
Pydantic schemas模块
"""

from .auth import (
    LoginRequest, RegisterRequest,
    TokenResponse, RefreshTokenResponse, AuthResponse, SessionInfo
)
from .work import (
    WorkCreate, WorkUpdate, WorkResponse, WorkListResponse,
    WorkCollaboratorCreate, WorkCollaboratorUpdate, WorkCollaboratorResponse
)

__all__ = [
    # Auth schemas
    "LoginRequest", "RegisterRequest",
    "TokenResponse", "RefreshTokenResponse", "AuthResponse", "SessionInfo",
    # Work schemas
    "WorkCreate", "WorkUpdate", "WorkResponse", "WorkListResponse",
    "WorkCollaboratorCreate", "WorkCollaboratorUpdate", "WorkCollaboratorResponse",
]