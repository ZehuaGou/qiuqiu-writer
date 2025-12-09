"""
章节模型
"""

from datetime import datetime
from typing import Dict, Any, Optional

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, JSON,
    Index, ForeignKey
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Chapter(Base):
    """章节表"""

    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    chapter_number = Column(Integer, nullable=False)
    volume_number = Column(Integer, default=1, index=True)
    status = Column(String(20), default="draft", index=True)  # draft/published/archived
    word_count = Column(Integer, default=0)
    estimated_reading_time = Column(Integer, default=0)  # 预估阅读时间（分钟）
    content_hash = Column(String(32), index=True)  # 内容哈希，用于对比
    tags = Column(JSON, default=list)
    summary = Column(Text)  # 章节简介
    notes = Column(JSON, default=dict)  # 作者备注
    metadata = Column(JSON, default=dict)  # 扩展元数据
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    published_at = Column(DateTime(timezone=True))

    # 关系
    work = relationship("Work", back_populates="chapters")
    versions = relationship("ChapterVersion", back_populates="chapter", cascade="all, delete-orphan")

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

    def to_dict(self, include_content: bool = False, include_versions: bool = False) -> Dict[str, Any]:
        """转换为字典"""
        data = {
            "id": self.id,
            "work_id": self.work_id,
            "title": self.title,
            "chapter_number": self.chapter_number,
            "volume_number": self.volume_number,
            "status": self.status,
            "word_count": self.word_count,
            "estimated_reading_time": self.estimated_reading_time,
            "content_hash": self.content_hash,
            "tags": self.tags or [],
            "summary": self.summary,
            "notes": self.notes or {},
            "metadata": self.metadata or {},
            "sort_order": self.sort_order,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "content_preview": self.content_preview,
        }

        if include_versions:
            data["versions"] = [
                {
                    "id": version.id,
                    "version_number": version.version_number,
                    "title": version.title,
                    "word_count": version.word_count,
                    "change_description": version.change_description,
                    "created_by": version.created_by,
                    "created_at": version.created_at.isoformat() if version.created_at else None,
                }
                for version in self.versions
            ]

        return data


class ChapterVersion(Base):
    """章节版本表"""

    __tablename__ = "chapter_versions"

    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    title = Column(String(200), nullable=False)
    content = Column(Text)
    content_hash = Column(String(32), index=True)
    word_count = Column(Integer, default=0)
    change_description = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # 关系
    chapter = relationship("Chapter", back_populates="versions")
    created_by_user = relationship("User", back_populates="chapter_versions")

    def __repr__(self):
        return f"<ChapterVersion(id={self.id}, chapter_id={self.chapter_id}, version={self.version_number})>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "version_number": self.version_number,
            "title": self.title,
            "content": self.content,
            "content_hash": self.content_hash,
            "word_count": self.word_count,
            "change_description": self.change_description,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Character(Base):
    """角色表"""

    __tablename__ = "characters"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    display_name = Column(String(100))
    description = Column(Text)
    avatar_url = Column(String(255))
    gender = Column(String(20), index=True)
    age = Column(Integer)
    personality = Column(JSON, default=dict)  # 性格特质
    appearance = Column(JSON, default=dict)  # 外貌描述
    background = Column(JSON, default=dict)  # 背景故事
    relationships = Column(JSON, default=dict)  # 角色关系
    tags = Column(JSON, default=list)
    is_main_character = Column(Boolean, default=False, index=True)
    is_active = Column(Boolean, default=True)
    metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    work = relationship("Work", back_populates="characters")

    def __repr__(self):
        return f"<Character(id={self.id}, work_id={self.work_id}, name='{self.name}')>"

    @property
    def full_name(self) -> str:
        """获取角色全名"""
        return self.display_name or self.name

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "work_id": self.work_id,
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "avatar_url": self.avatar_url,
            "gender": self.gender,
            "age": self.age,
            "personality": self.personality or {},
            "appearance": self.appearance or {},
            "background": self.background or {},
            "relationships": self.relationships or {},
            "tags": self.tags or [],
            "is_main_character": self.is_main_character,
            "is_active": self.is_active,
            "metadata": self.metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "full_name": self.full_name,
        }


class Faction(Base):
    """阵营/组织表"""

    __tablename__ = "factions"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    display_name = Column(String(100))
    description = Column(Text)
    logo_url = Column(String(255))
    type = Column(String(50), index=True)  # organization/political/religious/magical/etc.
    scale = Column(String(30), index=True)  # global/regional/local/family
    power_level = Column(Integer, default=0, index=True)  # 实力等级
    headquarters = Column(String(200))
    ideology = Column(Text)  # 理念/宗旨
    structure = Column(JSON, default=dict)  # 组织结构
    relationships = Column(JSON, default=dict)  # 派系关系
    tags = Column(JSON, default=list)
    metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    work = relationship("Work", back_populates="factions")

    def __repr__(self):
        return f"<Faction(id={self.id}, work_id={self.work_id}, name='{self.name}')>"

    @property
    def full_name(self) -> str:
        """获取阵营全名"""
        return self.display_name or self.name

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "work_id": self.work_id,
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "logo_url": self.logo_url,
            "type": self.type,
            "scale": self.scale,
            "power_level": self.power_level,
            "headquarters": self.headquarters,
            "ideology": self.ideology,
            "structure": self.structure or {},
            "relationships": self.relationships or {},
            "tags": self.tags or [],
            "metadata": self.metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "full_name": self.full_name,
        }


# 索引
Index("idx_chapters_work", Chapter.work_id)
Index("idx_chapters_volume", Chapter.volume_number)
Index("idx_chapters_status", Chapter.status)
Index("idx_chapters_number", Chapter.chapter_number)
Index("idx_chapters_content_hash", Chapter.content_hash)

Index("idx_chapter_versions_chapter", ChapterVersion.chapter_id)
Index("idx_chapter_versions_version", ChapterVersion.version_number)
Index("idx_chapter_versions_created_by", ChapterVersion.created_by)
Index("idx_chapter_versions_chapter_version", ChapterVersion.chapter_id, ChapterVersion.version_number)

Index("idx_characters_work", Character.work_id)
Index("idx_characters_main", Character.is_main_character)
Index("idx_characters_gender", Character.gender)
Index("idx_characters_active", Character.is_active)

Index("idx_factions_work", Faction.work_id)
Index("idx_factions_type", Faction.type)
Index("idx_factions_scale", Faction.scale)
Index("idx_factions_power", Faction.power_level)

# 复合索引
Index("idx_chapters_work_volume_number", Chapter.work_id, Chapter.volume_number, Chapter.chapter_number)
Index("idx_chapters_work_status", Chapter.work_id, Chapter.status)