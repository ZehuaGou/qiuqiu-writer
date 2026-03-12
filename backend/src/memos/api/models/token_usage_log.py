"""
Token 用量日志模型
"""

from sqlalchemy import (
    Column, BigInteger, Integer, String, DateTime, ForeignKey, Index
)
from sqlalchemy.sql import func

from memos.api.core.database import Base


class TokenUsageLog(Base):
    """Token 用量日志表，记录每次 AI 调用的 token 消耗"""

    __tablename__ = "token_usage_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(
        String(40),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feature = Column(String(50), nullable=False)  # chat/analyze/generate/other
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    work_id = Column(String(40), nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    def __repr__(self):
        return (
            f"<TokenUsageLog(id={self.id}, user_id={self.user_id}, "
            f"feature={self.feature}, total_tokens={self.total_tokens})>"
        )


# 复合索引：按用户和时间查询月度用量
Index("idx_token_usage_logs_user_created", TokenUsageLog.user_id, TokenUsageLog.created_at)
