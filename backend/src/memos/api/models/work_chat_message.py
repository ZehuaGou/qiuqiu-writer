"""
Work 聊天记录模型

存储协作房间内的用户消息和 AI 消息。
"""

import time
import uuid

from sqlalchemy import Boolean, Column, Float, Index, String, Text

from memos.api.core.database import Base


class WorkChatMessage(Base):
    __tablename__ = "work_chat_messages"

    id = Column(String(40), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_id = Column(String(40), nullable=False, index=True)
    user_id = Column(String(40), nullable=False)
    user_name = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    is_ai = Column(Boolean, default=False, nullable=False)
    created_at = Column(Float, default=time.time, nullable=False)

    __table_args__ = (
        Index("ix_work_chat_messages_work_created", "work_id", "created_at"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "work_id": self.work_id,
            "user_id": self.user_id,
            "user_name": self.user_name,
            "content": self.content,
            "is_ai": self.is_ai,
            "created_at": self.created_at,
        }
