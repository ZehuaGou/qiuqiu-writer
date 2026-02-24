"""
章节模型
"""

from datetime import datetime
from typing import Dict, Any, Optional

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, LargeBinary,
    Index, ForeignKey
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from memos.api.core.database import Base


class Chapter(Base):
    """章节表"""

    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(String(40), ForeignKey("works.id", ondelete="CASCADE"), nullable=False, index=True)
    volume_id = Column(Integer, ForeignKey("volumes.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    chapter_number = Column(Integer, nullable=False)
    volume_number = Column(Integer, default=1, index=True)
    status = Column(String(20), default="draft", index=True)  # draft/published/archived/deleted
    word_count = Column(Integer, default=0)
    estimated_reading_time = Column(Integer, default=0)  # 预估阅读时间（分钟）
    content_hash = Column(String(32), index=True)  # 内容哈希，用于对比
    tags = Column(JSONB, default=list)
    summary = Column(Text)  # 章节简介
    notes = Column(JSONB, default=dict)  # 作者备注
    chapter_metadata = Column("metadata", JSONB, default=dict)  # 扩展元数据
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    published_at = Column(DateTime(timezone=True))

    # 关系
    work = relationship("Work", back_populates="chapters")
    volume = relationship("Volume", back_populates="chapters")

    def __repr__(self):
        return f"<Chapter(id={self.id}, work_id={self.work_id}, title='{self.title}', number={self.chapter_number})>"

    @property
    def is_draft(self) -> bool:
        """是否为草稿"""
        return self.status == "draft"

    @property
    def is_published(self) -> bool:
        """是否已发布"""
        return self.status == "published"

    @property
    def is_archived(self) -> bool:
        """是否已归档"""
        return self.status == "archived"

    @property
    def estimated_reading_hours(self) -> float:
        """预估阅读小时数"""
        return self.estimated_reading_time / 60 if self.estimated_reading_time else 0

    @property
    def content_preview(self) -> str:
        """内容预览（前100字符）"""
        if not self.summary:
            return ""
        return self.summary[:100] + "..." if len(self.summary) > 100 else self.summary

    def to_dict(self, include_content: bool = False) -> Dict[str, Any]:
        """转换为字典"""
        data = {
            "id": self.id,
            "work_id": self.work_id,
            "title": self.title,
            "chapter_number": self.chapter_number,
            "volume_number": self.volume_number,
            "volume_id": self.volume_id,
            "status": self.status,
            "word_count": self.word_count,
            "estimated_reading_time": self.estimated_reading_time,
            "content_hash": self.content_hash,
            "tags": self.tags or [],
            "summary": self.summary,
            "notes": self.notes or {},
            "metadata": self.chapter_metadata or {},
            "sort_order": self.sort_order,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "content_preview": self.content_preview,
        }

        if include_content and hasattr(self, 'content'):
            data["content"] = self.content

        return data


# 移除了 ChapterVersion 类




# 索引
Index("idx_chapters_work", Chapter.work_id)
Index("idx_chapters_volume", Chapter.volume_number)
Index("idx_chapters_status", Chapter.status)
Index("idx_chapters_number", Chapter.chapter_number)
Index("idx_chapters_content_hash", Chapter.content_hash)


class ChapterYjsSnapshot(Base):
    """章节 Yjs 原生快照表（Git 式版本历史，存 Y.encodeStateAsUpdate 的二进制）"""

    __tablename__ = "chapter_yjs_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(200), nullable=True)
    snapshot = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def to_meta_dict(self) -> Dict[str, Any]:
        """仅元数据，不含二进制"""
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "label": self.label,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


Index("idx_chapter_yjs_snapshots_chapter", ChapterYjsSnapshot.chapter_id)


# 复合索引
Index("idx_chapters_work_volume_number", Chapter.work_id, Chapter.volume_number, Chapter.chapter_number)
Index("idx_chapters_work_status", Chapter.work_id, Chapter.status)