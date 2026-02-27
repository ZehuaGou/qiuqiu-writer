"""
邀请码模型
"""

from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import Column, Integer, String, DateTime, Index
from sqlalchemy.sql import func

from memos.api.core.database import Base


class InvitationCode(Base):
    """邀请码表"""

    __tablename__ = "invitation_codes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String(32), unique=True, index=True, nullable=False)
    used = Column(Integer, default=0, nullable=False)  # 0=未使用, 1=已使用
    used_by_user_id = Column(String(40), nullable=True)  # 使用该码注册的用户ID
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<InvitationCode(id={self.id}, code='{self.code}', used={self.used})>"

    def to_dict(self) -> Dict[str, Any]:
        def safe_isoformat(dt):
            if dt is None:
                return None
            if isinstance(dt, str):
                return dt
            if hasattr(dt, "isoformat"):
                return dt.isoformat()
            return str(dt)

        return {
            "id": self.id,
            "code": self.code,
            "used": self.used,
            "used_by_user_id": self.used_by_user_id,
            "used_at": safe_isoformat(self.used_at),
            "created_at": safe_isoformat(self.created_at),
        }


Index("idx_invitation_codes_code", InvitationCode.code)
Index("idx_invitation_codes_used", InvitationCode.used)
