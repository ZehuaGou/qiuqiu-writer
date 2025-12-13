"""
Prompt模板模型
用于存储拆书功能和其他AI功能的提示词模板
"""

import json
import re
from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, JSON,
    Index, ForeignKey
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from memos.api.core.database import Base


class PromptTemplate(Base):
    """Prompt模板表"""

    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)  # 模板名称
    description = Column(Text)  # 模板描述
    template_type = Column(String(50), nullable=False, index=True)  # book_analysis/chapter_analysis/character_extraction等
    prompt_content = Column(Text, nullable=False)  # 提示词内容
    version = Column(String(20), default="1.0")  # 版本号
    is_default = Column(Boolean, default=False, index=True)  # 是否为默认模板
    is_active = Column(Boolean, default=True, index=True)  # 是否启用
    variables = Column(JSON, default=dict)  # 模板变量定义，如{"content": "章节内容", "settings": "分析设置"}
    template_metadata = Column("metadata", JSON, default=dict)  # 扩展元数据
    usage_count = Column(Integer, default=0)  # 使用次数
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # 组件相关字段（用于组件级别的prompt）
    component_id = Column(String(100), nullable=True, index=True)  # 组件ID（如：char-cards, cp-relations等）
    component_type = Column(String(50), nullable=True, index=True)  # 组件类型（如：character-card, relation-graph等）
    prompt_category = Column(String(20), nullable=True, index=True)  # prompt类别：generate（生成）或validate（验证）
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=True, index=True)  # 关联的作品ID（如果prompt是作品级别的）
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    creator = relationship("User")
    work = relationship("Work", foreign_keys=[work_id])

    def __repr__(self):
        return f"<PromptTemplate(id={self.id}, name='{self.name}', type='{self.template_type}')>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "template_type": self.template_type,
            "prompt_content": self.prompt_content,
            "version": self.version,
            "is_default": self.is_default,
            "is_active": self.is_active,
            "variables": self.variables or {},
            "metadata": self.template_metadata or {},
            "usage_count": self.usage_count,
            "creator_id": self.creator_id,
            "component_id": self.component_id,
            "component_type": self.component_type,
            "prompt_category": self.prompt_category,
            "work_id": self.work_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def format_prompt(self, **kwargs) -> str:
        """格式化提示词，替换变量
        支持英文变量名：{variable_name}
        支持中文变量名：{所有角色}、{章节角色}等
        支持metadata访问：{作品.xxx}、{章节.xxx}
        """
        content = self.prompt_content
        
        # 使用正则表达式匹配所有变量，包括中文和英文
        # 匹配 {变量名} 或 {对象.键} 格式
        pattern = r'\{([^}]+)\}'
        
        def replace_var(match):
            var_expr = match.group(1)
            
            # 处理 {对象.键} 格式（如 {作品.xxx}、{章节.xxx}）
            if '.' in var_expr:
                parts = var_expr.split('.', 1)
                obj_name = parts[0]
                key = parts[1]
                
                # 从kwargs中获取对象数据
                obj_data = kwargs.get(obj_name)
                if isinstance(obj_data, dict):
                    value = obj_data.get(key, '')
                    if value is None:
                        return ''
                    # 如果是复杂对象（字典或列表），格式化为JSON字符串
                    if isinstance(value, (dict, list)):
                        return json.dumps(value, ensure_ascii=False, indent=2)
                    return str(value)
                return ''
            
            # 处理普通变量（包括中文）
            if var_expr in kwargs:
                value = kwargs[var_expr]
                return str(value) if value is not None else ''
            
            # 如果变量不存在，返回空字符串（而不是保留原变量）
            return ''
        
        # 替换所有匹配的变量
        content = re.sub(pattern, replace_var, content)
        
        return content


# 索引
Index("idx_prompt_templates_type", PromptTemplate.template_type)
Index("idx_prompt_templates_default", PromptTemplate.is_default)
Index("idx_prompt_templates_active", PromptTemplate.is_active)
Index("idx_prompt_templates_component", PromptTemplate.component_id, PromptTemplate.component_type)
Index("idx_prompt_templates_work_component", PromptTemplate.work_id, PromptTemplate.component_id, PromptTemplate.prompt_category)

