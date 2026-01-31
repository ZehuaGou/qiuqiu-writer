"""
写作辅助功能模型
"""

from datetime import datetime
from typing import Optional, Dict, Any, List

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, JSON,
    Index, ForeignKey
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from memos.api.core.database import Base


class WritingPrompt(Base):
    """写作灵感表"""

    __tablename__ = "writing_prompts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    prompt_type = Column(String(30), nullable=False, index=True)  # scenario/dialogue/character/world_building
    category = Column(String(50), index=True)
    tags = Column(JSON, default=list)
    difficulty = Column(String(20))  # beginner/intermediate/advanced
    language = Column(String(10), default="zh-CN")
    is_public = Column(Boolean, default=True, index=True)
    usage_count = Column(Integer, default=0)
    creator_id = Column(String(40), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    creator = relationship("User")

    def __repr__(self):
        return f"<WritingPrompt(id={self.id}, title='{self.title}', type='{self.prompt_type}')>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "prompt_type": self.prompt_type,
            "category": self.category,
            "tags": self.tags or [],
            "difficulty": self.difficulty,
            "language": self.language,
            "is_public": self.is_public,
            "usage_count": self.usage_count,
            "creator_id": self.creator_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AIAnalysis(Base):
    """AI分析结果表"""

    __tablename__ = "ai_analyses"

    id = Column(Integer, primary_key=True, index=True)
    target_type = Column(String(20), nullable=False, index=True)  # work/chapter/character
    target_id = Column(Integer, nullable=False, index=True)
    analysis_type = Column(String(50), nullable=False, index=True)  # content_analysis/plot_analysis/character_development
    model_name = Column(String(50))
    analysis_result = Column(JSON, nullable=False)
    status = Column(String(20), default="completed", index=True)  # pending/processing/completed/failed
    created_by = Column(String(40), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    creator = relationship("User")

    def __repr__(self):
        return f"<AIAnalysis(id={self.id}, target_type='{self.target_type}', target_id={self.target_id})>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "analysis_type": self.analysis_type,
            "model_name": self.model_name,
            "analysis_result": self.analysis_result,
            "status": self.status,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# 索引
Index("idx_writing_prompts_type", WritingPrompt.prompt_type)
Index("idx_writing_prompts_category", WritingPrompt.category)
Index("idx_writing_prompts_public", WritingPrompt.is_public)

Index("idx_ai_analyses_target", AIAnalysis.target_type, AIAnalysis.target_id)
Index("idx_ai_analyses_type", AIAnalysis.analysis_type)
Index("idx_ai_analyses_status", AIAnalysis.status)