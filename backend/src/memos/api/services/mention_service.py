"""
提及替换服务
处理聊天消息中的 @chapter:123 和 @character:456 格式的提及，替换为实际内容
"""

import re
import json
import asyncio
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.services.chapter_service import ChapterService
from memos.api.services.sharedb_service import ShareDBService
from memos.log import get_logger

logger = get_logger(__name__)


class MentionService:
    """提及替换服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.chapter_service = ChapterService(db)
        self.sharedb_service = ShareDBService()
        self._sharedb_initialized = False
    
    async def replace_mentions_in_text(self, text: str) -> str:
        """
        替换文本中的提及标识为实际内容
        
        Args:
            text: 包含提及标识的文本，格式如 @chapter:123 或 @character:456
        
        Returns:
            替换后的文本
        """
        if not text:
            return text
        
        # 替换章节提及 @chapter:123
        text = await self._replace_chapter_mentions(text)
        
        # 替换角色提及 @character:456
        text = await self._replace_character_mentions(text)
        
        return text
    
    async def _replace_chapter_mentions(self, text: str) -> str:
        """替换章节提及"""
        pattern = r'@chapter:(\d+)'
        
        async def replace_match(match):
            chapter_id = int(match.group(1))
            try:
                chapter = await self.chapter_service.get_chapter_by_id(chapter_id)
                if not chapter:
                    logger.warning(f"章节 {chapter_id} 不存在")
                    return f"\n\n【章节引用：章节#{chapter_id}（不存在）】\n该章节在数据库中不存在，请检查章节ID是否正确。\n"
                
                # 获取章节基本信息
                chapter_title = chapter.title or f"章节#{chapter_id}"
                chapter_number = getattr(chapter, 'chapter_number', None)
                chapter_info = f"【章节引用：{chapter_title}"
                if chapter_number:
                    chapter_info += f"（第{chapter_number}章）"
                chapter_info += "】\n"
                
                # 尝试获取章节内容
                content_preview = "（内容为空）"
                try:
                    # 确保ShareDB服务已初始化
                    if not self._sharedb_initialized:
                        try:
                            await self.sharedb_service.initialize()
                            self._sharedb_initialized = True
                        except Exception as init_err:
                            logger.warning(f"ShareDB服务初始化失败: {init_err}，将尝试继续获取内容")
                    
                    document_id = f"work_{chapter.work_id}_chapter_{chapter_id}"
                    document = await self.sharedb_service.get_document(document_id)
                    
                    if document:
                        # ShareDB文档格式：{"id": "...", "content": "..."}
                        # content可能是字符串或字典
                        doc_content = document.get("content", "")
                        
                        # 如果content是字符串，直接使用
                        if isinstance(doc_content, str):
                            content = doc_content
                        # 如果content是字典，尝试提取文本
                        elif isinstance(doc_content, dict):
                            # 尝试从不同字段提取内容
                            content = (
                                doc_content.get("text", "") or 
                                doc_content.get("content", "") or 
                                doc_content.get("delta", "") or
                                json.dumps(doc_content, ensure_ascii=False)
                            )
                        # 其他类型，转换为字符串
                        else:
                            try:
                                import json
                                content = json.dumps(doc_content, ensure_ascii=False) if doc_content else ""
                            except:
                                content = str(doc_content) if doc_content else ""
                        
                        if content and content.strip():
                            # 截取前1000字符作为预览
                            content_preview = content[:1000] if len(content) > 1000 else content
                            if len(content) > 1000:
                                content_preview += "..."
                        else:
                            content_preview = "（内容为空）"
                    else:
                        # 尝试旧格式的文档ID
                        old_document_id = f"chapter_{chapter_id}"
                        document = await self.sharedb_service.get_document(old_document_id)
                        if document:
                            doc_content = document.get("content", "")
                            if isinstance(doc_content, str):
                                content = doc_content
                            elif isinstance(doc_content, dict):
                                content = (
                                    doc_content.get("text", "") or 
                                    doc_content.get("content", "") or 
                                    doc_content.get("delta", "") or
                                    json.dumps(doc_content, ensure_ascii=False)
                                )
                            else:
                                try:
                                    content = json.dumps(doc_content, ensure_ascii=False) if doc_content else ""
                                except:
                                    content = str(doc_content) if doc_content else ""
                            
                            if content and content.strip():
                                content_preview = content[:1000] if len(content) > 1000 else content
                                if len(content) > 1000:
                                    content_preview += "..."
                            else:
                                content_preview = "（内容为空）"
                        else:
                            logger.warning(f"无法从ShareDB获取章节 {chapter_id} 的内容，文档ID: {document_id} 和 {old_document_id} 都不存在")
                            content_preview = "（无法从ShareDB获取内容，可能该章节尚未保存内容）"
                            
                except Exception as e:
                    logger.error(f"获取章节 {chapter_id} 内容时出错: {e}", exc_info=True)
                    content_preview = f"（获取内容失败：{str(e)[:100]}）"
                
                # 添加章节元数据
                metadata_parts = []
                if hasattr(chapter, 'word_count') and chapter.word_count:
                    metadata_parts.append(f"字数：{chapter.word_count}")
                if hasattr(chapter, 'status') and chapter.status:
                    metadata_parts.append(f"状态：{chapter.status}")
                
                metadata_text = f"\n元数据：{', '.join(metadata_parts)}\n" if metadata_parts else ""
                
                # 构建替换文本
                replacement = f"\n\n{chapter_info}{metadata_text}内容预览：\n{content_preview}\n"
                return replacement
                
            except Exception as e:
                logger.error(f"替换章节提及失败 {chapter_id}: {e}", exc_info=True)
                return f"\n\n【章节引用：章节#{chapter_id}（获取失败）】\n错误信息：{str(e)[:200]}\n"
        
        # 使用异步替换
        matches = list(re.finditer(pattern, text))
        if not matches:
            return text
        
        replacements = await asyncio.gather(*[replace_match(m) for m in matches])
        
        # 从后往前替换，避免索引变化
        result = text
        for match, replacement in zip(reversed(matches), reversed(replacements)):
            start, end = match.span()
            result = result[:start] + replacement + result[end:]
        
        return result
    
    async def _replace_character_mentions(self, text: str) -> str:
        """替换角色提及"""
        pattern = r'@character:(\d+)'
        
        async def replace_match(match):
            character_id = int(match.group(1))
            try:
                # 从数据库获取角色信息
                from memos.api.models.characters import Character
                from sqlalchemy.future import select
                
                stmt = select(Character).where(Character.id == character_id)
                result = await self.db.execute(stmt)
                character = result.scalar_one_or_none()
                
                if not character:
                    logger.warning(f"角色 {character_id} 不存在")
                    return f"@角色#{character_id}(不存在)"
                
                # 构建角色信息
                name = character.display_name or character.name
                description = character.description or ""
                personality = character.personality or {}
                appearance = character.appearance or {}
                background = character.background or {}
                
                # 构建替换文本
                info_parts = []
                if description:
                    info_parts.append(f"简介：{description}")
                if personality:
                    info_parts.append(f"性格：{personality}")
                if appearance:
                    info_parts.append(f"外貌：{appearance}")
                if background:
                    info_parts.append(f"背景：{background}")
                
                info_text = "\n".join(info_parts) if info_parts else "（暂无详细信息）"
                replacement = f"\n\n【角色引用：{name}】\n{info_text}\n"
                return replacement
                
            except Exception as e:
                logger.error(f"替换角色提及失败 {character_id}: {e}", exc_info=True)
                return f"\n\n【角色引用：角色#{character_id}（获取失败）】\n错误信息：{str(e)[:200]}\n"
        
        # 使用异步替换
        matches = list(re.finditer(pattern, text))
        if not matches:
            return text
        
        replacements = await asyncio.gather(*[replace_match(m) for m in matches])
        
        # 从后往前替换，避免索引变化
        result = text
        for match, replacement in zip(reversed(matches), reversed(replacements)):
            start, end = match.span()
            result = result[:start] + replacement + result[end:]
        
        return result
    
    async def replace_mentions_in_history(self, history: list) -> list:
        """
        替换对话历史中的提及
        
        Args:
            history: 对话历史列表，每个元素包含 role 和 content
        
        Returns:
            替换后的对话历史
        """
        if not history:
            return history
        
        replaced_history = []
        for msg in history:
            if isinstance(msg, dict) and 'content' in msg:
                new_msg = msg.copy()
                new_msg['content'] = await self.replace_mentions_in_text(msg['content'])
                replaced_history.append(new_msg)
            else:
                replaced_history.append(msg)
        
        return replaced_history

