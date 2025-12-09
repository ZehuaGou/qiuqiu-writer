"""
作品模板模型
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


class WorkTemplate(Base):
    """作品信息模板表"""

    __tablename__ = "work_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    work_type = Column(String(20), nullable=False, index=True)
    is_system = Column(Boolean, default=False, index=True)  # 系统模板 vs 用户模板
    is_public = Column(Boolean, default=False, index=True)
    creator_id = Column(Integer, ForeignKey("users.id"), index=True)
    category = Column(String(50), index=True)
    tags = Column(JSON, default=list)
    template_config = Column(JSON, nullable=False)  # 模板配置信息
    usage_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    creator = relationship("User")
    fields = relationship("TemplateField", back_populates="template", cascade="all, delete-orphan")
    work_info_extended = relationship("WorkInfoExtended", back_populates="template")

    def __repr__(self):
        return f"<WorkTemplate(id={self.id}, name='{self.name}', type='{self.work_type}')>"

    @property
    def is_user_template(self) -> bool:
        """是否为用户模板"""
        return not self.is_system

    @property
    def field_count(self) -> int:
        """字段数量"""
        return len(self.fields) if self.fields else 0

    def to_dict(self, include_fields: bool = False, include_stats: bool = False) -> Dict[str, Any]:
        """转换为字典"""
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "work_type": self.work_type,
            "is_system": self.is_system,
            "is_public": self.is_public,
            "creator_id": self.creator_id,
            "category": self.category,
            "tags": self.tags or [],
            "template_config": self.template_config or {},
            "usage_count": self.usage_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_fields:
            data["fields"] = [
                {
                    "id": field.id,
                    "field_name": field.field_name,
                    "field_type": field.field_type,
                    "field_label": field.field_label,
                    "field_description": field.field_description,
                    "field_options": field.field_options or {},
                    "is_required": field.is_required,
                    "default_value": field.default_value,
                    "sort_order": field.sort_order,
                }
                for field in (self.fields or [])
            ]

        if include_stats:
            data["field_count"] = self.field_count

        return data


class TemplateField(Base):
    """模板字段表"""

    __tablename__ = "template_fields"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("work_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    field_name = Column(String(100), nullable=False)
    field_type = Column(String(50), nullable=False)  # text/textarea/select/checkbox/date/number
    field_label = Column(String(100), nullable=False)
    field_description = Column(Text)
    field_options = Column(JSON)  # 选择题选项、验证规则等
    is_required = Column(Boolean, default=False)
    default_value = Column(Text)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    template = relationship("WorkTemplate", back_populates="fields")

    def __repr__(self):
        return f"<TemplateField(id={self.id}, template_id={self.template_id}, name='{self.field_name}', type='{self.field_type}')>"

    @property
    def is_select_field(self) -> bool:
        """是否为选择字段"""
        return self.field_type in ["select", "checkbox", "radio"]

    @property
    def is_text_field(self) -> bool:
        """是否为文本字段"""
        return self.field_type in ["text", "textarea"]

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "template_id": self.template_id,
            "field_name": self.field_name,
            "field_type": self.field_type,
            "field_label": self.field_label,
            "field_description": self.field_description,
            "field_options": self.field_options or {},
            "is_required": self.is_required,
            "default_value": self.default_value,
            "sort_order": self.sort_order,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class WorkInfoExtended(Base):
    """作品信息扩展表"""

    __tablename__ = "work_info_extended"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    template_id = Column(Integer, ForeignKey("work_templates.id"), index=True)
    field_values = Column(JSON, default=dict)  # 存储模板字段的具体值
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    work = relationship("Work", back_populates="extended_info")
    template = relationship("WorkTemplate", back_populates="work_info_extended")

    def __repr__(self):
        return f"<WorkInfoExtended(id={self.id}, work_id={self.work_id}, template_id={self.template_id})>"

    @property
    def filled_fields_count(self) -> int:
        """已填写字段数量"""
        if not self.field_values:
            return 0
        return len([k for k, v in self.field_values.items() if v is not None and str(v).strip()])

    def to_dict(self, include_template_info: bool = False) -> Dict[str, Any]:
        """转换为字典"""
        data = {
            "id": self.id,
            "work_id": self.work_id,
            "template_id": self.template_id,
            "field_values": self.field_values or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "filled_fields_count": self.filled_fields_count,
        }

        if include_template_info and self.template:
            data["template"] = self.template.to_dict(include_fields=True)

        return data


class WritingPrompt(Base):
    """写作灵感/提示表"""

    __tablename__ = "writing_prompts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    prompt_type = Column(String(30), nullable=False, index=True)  # scenario/dialogue/character/world_building
    category = Column(String(50), index=True)
    tags = Column(JSON, default=list)
    difficulty = Column(String(20), index=True)  # beginner/intermediate/advanced
    language = Column(String(10), default="zh-CN")
    is_public = Column(Boolean, default=True, index=True)
    usage_count = Column(Integer, default=0)
    creator_id = Column(Integer, ForeignKey("users.id"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    creator = relationship("User")

    def __repr__(self):
        return f"<WritingPrompt(id={self.id}, title='{self.title}', type='{self.prompt_type}')>"

    @property
    def is_scenario_type(self) -> bool:
        """是否为场景类型"""
        return self.prompt_type == "scenario"

    @property
    def is_dialogue_type(self) -> bool:
        """是否为对话类型"""
        return self.prompt_type == "dialogue"

    @property
    def is_character_type(self) -> bool:
        """是否为角色类型"""
        return self.prompt_type == "character"

    @property
    def is_world_building_type(self) -> bool:
        """是否为世界观类型"""
        return self.prompt_type == "world_building"

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
    created_by = Column(Integer, ForeignKey("users.id"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    created_by_user = relationship("User")
    work = relationship("Work", back_populates="ai_analyses", foreign_keys=[target_id], primaryjoin="and_(AIAnalysis.target_type=='work', foreign(AIAnalysis.target_id)==Work.id)")

    def __repr__(self):
        return f"<AIAnalysis(id={self.id}, target_type='{self.target_type}', target_id={self.target_id}, analysis_type='{self.analysis_type}')>"

    @property
    def is_content_analysis(self) -> bool:
        """是否为内容分析"""
        return self.analysis_type == "content_analysis"

    @property
    def is_plot_analysis(self) -> bool:
        """是否为情节分析"""
        return self.analysis_type == "plot_analysis"

    @property
    def is_character_analysis(self) -> bool:
        """是否为角色分析"""
        return self.analysis_type == "character_development"

    @property
    def is_completed(self) -> bool:
        """分析是否完成"""
        return self.status == "completed"

    @property
    def is_pending(self) -> bool:
        """分析是否进行中"""
        return self.status == "pending"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "analysis_type": self.analysis_type,
            "model_name": self.model_name,
            "analysis_result": self.analysis_result or {},
            "status": self.status,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SystemSetting(Base):
    """系统设置表"""

    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(JSON, nullable=False)
    description = Column(Text)
    category = Column(String(50), index=True)
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<SystemSetting(key='{self.key}', category='{self.category}')>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "key": self.key,
            "value": self.value,
            "description": self.description,
            "category": self.category,
            "is_public": self.is_public,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AuditLog(Base):
    """审计日志表"""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    action = Column(String(50), nullable=False, index=True)  # create/update/delete/login/logout
    target_type = Column(String(50), index=True)  # work/chapter/user
    target_id = Column(Integer, index=True)
    details = Column(JSON, default=dict)
    ip_address = Column(String(45))  # 支持IPv6
    user_agent = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # 关系
    user = relationship("User", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog(id={self.id}, user_id={self.user_id}, action='{self.action}')>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "action": self.action,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "details": self.details or {},
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# 索引
Index("idx_work_templates_type", WorkTemplate.work_type)
Index("idx_work_templates_creator", WorkTemplate.creator_id)
Index("idx_work_templates_public", WorkTemplate.is_public)
Index("idx_work_templates_system", WorkTemplate.is_system)

Index("idx_template_fields_template", TemplateField.template_id)
Index("idx_template_fields_name", TemplateField.field_name)
Index("idx_template_fields_type", TemplateField.field_type)

Index("idx_work_info_extended_work", WorkInfoExtended.work_id)
Index("idx_work_info_extended_template", WorkInfoExtended.template_id)

Index("idx_writing_prompts_type", WritingPrompt.prompt_type)
Index("idx_writing_prompts_category", WritingPrompt.category)
Index("idx_writing_prompts_difficulty", WritingPrompt.difficulty)
Index("idx_writing_prompts_creator", WritingPrompt.creator_id)
Index("idx_writing_prompts_public", WritingPrompt.is_public)

Index("idx_ai_analyses_target", AIAnalysis.target_type, AIAnalysis.target_id)
Index("idx_ai_analyses_type", AIAnalysis.analysis_type)
Index("idx_ai_analyses_status", AIAnalysis.status)
Index("idx_ai_analyses_creator", AIAnalysis.created_by)

Index("idx_system_settings_key", SystemSetting.key)
Index("idx_system_settings_category", SystemSetting.category)

Index("idx_audit_logs_user", AuditLog.user_id)
Index("idx_audit_logs_action", AuditLog.action)
Index("idx_audit_logs_target", AuditLog.target_type, AuditLog.target_id)
Index("idx_audit_logs_created", AuditLog.created_at)

# 复合索引
Index("idx_ai_analyses_target_type_id", AIAnalysis.target_type, AIAnalysis.target_id, AIAnalysis.analysis_type)
Index("idx_audit_logs_user_action", AuditLog.user_id, AuditLog.action)
Index("idx_work_templates_type_public", WorkTemplate.work_type, WorkTemplate.is_public)