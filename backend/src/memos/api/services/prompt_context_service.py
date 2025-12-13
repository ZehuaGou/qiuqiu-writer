"""
统一的Prompt上下文服务
用于收集环境信息、格式化prompt、处理AI响应并存储结果
"""

import json
import re
from typing import Dict, Any, List, Optional, Set
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_

from memos.api.models.prompt_template import PromptTemplate
from memos.api.models.work import Work
from memos.api.models.chapter import Chapter
from memos.api.models.characters import Character
from memos.api.models.location import Location
from memos.api.services.sharedb_service import ShareDBService
from memos.api.services.work_service import WorkService
from memos.api.services.chapter_service import ChapterService
from memos.log import get_logger

logger = get_logger(__name__)


class PromptContext:
    """Prompt上下文数据容器"""
    
    def __init__(self):
        self.work: Optional[Work] = None
        self.current_chapter: Optional[Chapter] = None
        self.all_characters: List[Character] = []
        self.chapter_characters: List[Character] = []  # 当前章节使用的角色
        self.previous_chapters: List[Chapter] = []
        self.previous_chapters_content: List[str] = []
        self.previous_outlines: List[Dict[str, Any]] = []
        self.previous_detailed_outlines: List[Dict[str, Any]] = []
        self.locations: List[Location] = []
        self.custom_data: Dict[str, Any] = {}  # 自定义数据
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典，用于prompt格式化"""
        return {
            "work": {
                "id": self.work.id if self.work else None,
                "title": self.work.title if self.work else "",
                "description": self.work.description if self.work else "",
                "genre": self.work.genre if self.work else "",
                "category": self.work.category if self.work else "",
            } if self.work else {},
            "current_chapter": {
                "id": self.current_chapter.id if self.current_chapter else None,
                "title": self.current_chapter.title if self.current_chapter else "",
                "chapter_number": self.current_chapter.chapter_number if self.current_chapter else None,
                "summary": self.current_chapter.summary if self.current_chapter else "",
            } if self.current_chapter else {},
            "all_characters": [char.to_dict() for char in self.all_characters],
            "chapter_characters": [char.to_dict() for char in self.chapter_characters],
            "previous_chapters": [
                {
                    "title": ch.title,
                    "chapter_number": ch.chapter_number,
                    "summary": ch.summary or "",
                }
                for ch in self.previous_chapters
            ],
            "previous_chapters_content": self.previous_chapters_content,
            "previous_outlines": self.previous_outlines,
            "previous_detailed_outlines": self.previous_detailed_outlines,
            "locations": [loc.to_dict() if hasattr(loc, 'to_dict') else {
                "name": loc.name,
                "description": loc.description or "",
            } for loc in self.locations],
            "custom_data": self.custom_data,
        }


class PromptContextService:
    """统一的Prompt上下文服务"""
    
    # 支持的prompt类型
    PROMPT_TYPES = {
        "character_generation": "角色生成",
        "character_extraction": "角色提取",
        "chapter_generation": "章节生成",
        "chapter_summary": "章节总结",
        "outline_generation": "大纲生成",
        "detailed_outline_generation": "细纲生成",
        "book_analysis": "作品分析",
        "chapter_analysis": "章节分析",
    }
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.work_service = WorkService(db)
        self.chapter_service = ChapterService(db)
        self.sharedb_service = ShareDBService()
    
    async def initialize(self):
        """初始化服务（初始化ShareDB等）"""
        await self.sharedb_service.initialize()
    
    def extract_required_variables(self, prompt_content: str) -> Dict[str, bool]:
        """
        从prompt模板中提取需要的变量
        
        Args:
            prompt_content: Prompt模板内容
        
        Returns:
            字典，表示需要获取哪些信息：
            {
                "need_characters": bool,  # 需要所有角色
                "need_chapter_characters": bool,  # 需要章节角色
                "need_locations": bool,  # 需要地点
                "need_previous_chapters": bool,  # 需要前文章节
                "need_previous_content": bool,  # 需要前文内容
                "need_previous_outlines": bool,  # 需要前文大纲
                "need_previous_detailed_outlines": bool,  # 需要前文细纲
                "need_chapter_content": bool,  # 需要章节内容
            }
        """
        # 使用正则表达式提取所有变量
        pattern = r'\{([^}]+)\}'
        variables = set(re.findall(pattern, prompt_content))
        
        requirements = {
            "need_characters": False,
            "need_chapter_characters": False,
            "need_locations": False,
            "need_previous_chapters": False,
            "need_previous_content": False,
            "need_previous_outlines": False,
            "need_previous_detailed_outlines": False,
            "need_chapter_content": False,
        }
        
        # 角色相关变量
        character_vars = {
            "all_characters", "所有角色",
            "chapter_characters", "章节角色"
        }
        if any(var in variables for var in character_vars):
            requirements["need_characters"] = True
        
        if any(var in variables for var in {"chapter_characters", "章节角色"}):
            requirements["need_chapter_characters"] = True
        
        # 地点相关变量
        location_vars = {"locations", "地点"}
        if any(var in variables for var in location_vars):
            requirements["need_locations"] = True
        
        # 前文相关变量
        previous_summary_vars = {"previous_chapters_summary", "前文摘要"}
        if any(var in variables for var in previous_summary_vars):
            requirements["need_previous_chapters"] = True
        
        previous_content_vars = {"previous_chapters_content", "前文内容"}
        if any(var in variables for var in previous_content_vars):
            requirements["need_previous_chapters"] = True
            requirements["need_previous_content"] = True
        
        previous_outline_vars = {"previous_outlines", "前文大纲"}
        if any(var in variables for var in previous_outline_vars):
            requirements["need_previous_chapters"] = True
            requirements["need_previous_outlines"] = True
        
        previous_detailed_outline_vars = {"previous_detailed_outlines", "前文细纲"}
        if any(var in variables for var in previous_detailed_outline_vars):
            requirements["need_previous_chapters"] = True
            requirements["need_previous_detailed_outlines"] = True
        
        # 章节内容相关变量
        content_vars = {"content", "章节内容"}
        if any(var in variables for var in content_vars):
            requirements["need_chapter_content"] = True
        
        # 检查是否有metadata访问（需要作品和章节的基本信息）
        # 这些在build_context中总是会获取，所以不需要特殊标记
        
        return requirements
    
    async def build_context(
        self,
        work_id: int,
        chapter_id: Optional[int] = None,
        include_previous_chapters: int = 3,  # 包含前N章
        include_characters: Optional[bool] = None,  # None表示自动判断
        include_locations: Optional[bool] = None,  # None表示自动判断
        custom_data: Optional[Dict[str, Any]] = None,
        requirements: Optional[Dict[str, bool]] = None  # 根据prompt需要的变量
    ) -> PromptContext:
        """
        构建Prompt上下文（支持按需获取）
        
        Args:
            work_id: 作品ID
            chapter_id: 当前章节ID（可选）
            include_previous_chapters: 包含前N章的信息
            include_characters: 是否包含角色信息（None表示根据requirements自动判断）
            include_locations: 是否包含地点信息（None表示根据requirements自动判断）
            custom_data: 自定义数据
            requirements: 根据prompt需要的变量（如果提供，会覆盖include_characters和include_locations）
        
        Returns:
            PromptContext对象
        """
        context = PromptContext()
        
        # 根据requirements决定需要获取哪些信息
        if requirements:
            need_characters = requirements.get("need_characters", False)
            need_chapter_characters = requirements.get("need_chapter_characters", False)
            need_locations = requirements.get("need_locations", False)
            need_previous_chapters = requirements.get("need_previous_chapters", False)
            need_previous_content = requirements.get("need_previous_content", False)
            need_previous_outlines = requirements.get("need_previous_outlines", False)
            need_previous_detailed_outlines = requirements.get("need_previous_detailed_outlines", False)
        else:
            # 如果没有提供requirements，使用默认值或传入的参数
            need_characters = include_characters if include_characters is not None else True
            need_chapter_characters = need_characters  # 如果需要角色，也获取章节角色
            need_locations = include_locations if include_locations is not None else True
            need_previous_chapters = True  # 默认获取前文
            need_previous_content = True
            need_previous_outlines = True
            need_previous_detailed_outlines = True
        
        # 1. 获取作品信息（总是需要）
        context.work = await self.work_service.get_work_by_id(work_id)
        if not context.work:
            raise ValueError(f"作品不存在: {work_id}")
        
        # 2. 获取当前章节信息（如果提供了chapter_id）
        if chapter_id:
            context.current_chapter = await self.chapter_service.get_chapter_by_id(chapter_id)
            if context.current_chapter and context.current_chapter.work_id != work_id:
                raise ValueError(f"章节 {chapter_id} 不属于作品 {work_id}")
        
        # 3. 获取所有角色（如果需要）
        if need_characters:
            stmt = select(Character).where(
                and_(
                    Character.work_id == work_id,
                    Character.is_active == True
                )
            ).order_by(
                Character.is_main_character.desc(),
                Character.name.asc()
            )
            result = await self.db.execute(stmt)
            context.all_characters = list(result.scalars().all())
            
            # 获取当前章节使用的角色（如果需要且有当前章节）
            if need_chapter_characters and context.current_chapter:
                context.chapter_characters = await self._extract_chapter_characters(
                    context.current_chapter,
                    context.all_characters
                )
        
        # 4. 获取地点信息（如果需要）
        if need_locations:
            stmt = select(Location).where(
                and_(
                    Location.work_id == work_id,
                    Location.is_active == True
                )
            )
            result = await self.db.execute(stmt)
            context.locations = list(result.scalars().all())
        
        # 5. 获取前文信息（如果需要且有当前章节）
        if need_previous_chapters and context.current_chapter:
            previous_chapters, previous_content, previous_outlines, previous_detailed_outlines = \
                await self._get_previous_chapters_info(
                    work_id,
                    context.current_chapter.chapter_number,
                    context.current_chapter.volume_number,
                    include_previous_chapters,
                    need_content=need_previous_content,
                    need_outlines=need_previous_outlines,
                    need_detailed_outlines=need_previous_detailed_outlines
                )
            context.previous_chapters = previous_chapters
            if need_previous_content:
                context.previous_chapters_content = previous_content
            if need_previous_outlines:
                context.previous_outlines = previous_outlines
            if need_previous_detailed_outlines:
                context.previous_detailed_outlines = previous_detailed_outlines
        
        # 6. 添加自定义数据
        if custom_data:
            context.custom_data = custom_data
        
        return context
    
    async def _extract_chapter_characters(
        self,
        chapter: Chapter,
        all_characters: List[Character]
    ) -> List[Character]:
        """从章节内容中提取使用的角色"""
        try:
            # 从ShareDB获取章节内容
            document = await self.sharedb_service.get_document(f"chapter_{chapter.id}")
            if not document:
                return []
            
            content = document.get("content", "")
            if not content:
                return []
            
            # 简单的角色匹配：检查角色名称是否出现在内容中
            used_characters = []
            for char in all_characters:
                # 检查角色名称和显示名称
                names_to_check = [char.name]
                if char.display_name:
                    names_to_check.append(char.display_name)
                
                for name in names_to_check:
                    if name and name in content:
                        used_characters.append(char)
                        break
            
            return used_characters
        except Exception as e:
            logger.warning(f"提取章节角色失败: {e}")
            return []
    
    async def _get_previous_chapters_info(
        self,
        work_id: int,
        current_chapter_number: int,
        current_volume_number: int,
        count: int,
        need_content: bool = True,
        need_outlines: bool = True,
        need_detailed_outlines: bool = True
    ) -> tuple[List[Chapter], List[str], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        获取前N章的信息（支持按需获取）
        
        Args:
            work_id: 作品ID
            current_chapter_number: 当前章节号
            current_volume_number: 当前卷号
            count: 获取前N章
            need_content: 是否需要获取前文内容
            need_outlines: 是否需要获取前文大纲
            need_detailed_outlines: 是否需要获取前文细纲
        """
        # 获取前N章
        stmt = select(Chapter).where(
            and_(
                Chapter.work_id == work_id,
                Chapter.volume_number == current_volume_number,
                Chapter.chapter_number < current_chapter_number
            )
        ).order_by(
            Chapter.chapter_number.desc()
        ).limit(count)
        
        result = await self.db.execute(stmt)
        previous_chapters = list(result.scalars().all())
        previous_chapters.reverse()  # 按章节号正序排列
        
        # 获取前文内容、大纲、细纲（按需）
        previous_content = []
        previous_outlines = []
        previous_detailed_outlines = []
        
        for chapter in previous_chapters:
            # 获取内容（如果需要）
            if need_content:
                try:
                    document = await self.sharedb_service.get_document(f"chapter_{chapter.id}")
                    if document:
                        content = document.get("content", "")
                        previous_content.append(content)
                    else:
                        previous_content.append("")
                except Exception:
                    previous_content.append("")
            else:
                previous_content.append("")
            
            # 获取大纲和细纲（如果需要）
            metadata = chapter.chapter_metadata or {}
            if need_outlines:
                previous_outlines.append(metadata.get("outline", {}))
            else:
                previous_outlines.append({})
            
            if need_detailed_outlines:
                previous_detailed_outlines.append(metadata.get("detailed_outline", {}))
            else:
                previous_detailed_outlines.append({})
        
        return previous_chapters, previous_content, previous_outlines, previous_detailed_outlines
    
    async def get_prompt_template(
        self,
        template_type: str,
        template_id: Optional[int] = None
    ) -> Optional[PromptTemplate]:
        """
        获取prompt模板
        
        Args:
            template_type: 模板类型
            template_id: 指定的模板ID（可选，如果提供则使用指定的模板）
        
        Returns:
            PromptTemplate对象
        """
        if template_id:
            stmt = select(PromptTemplate).where(
                and_(
                    PromptTemplate.id == template_id,
                    PromptTemplate.is_active == True
                )
            )
            result = await self.db.execute(stmt)
            template = result.scalar_one_or_none()
            if template:
                return template
        
        # 获取默认模板
        stmt = select(PromptTemplate).where(
            and_(
                PromptTemplate.template_type == template_type,
                PromptTemplate.is_default == True,
                PromptTemplate.is_active == True
            )
        ).order_by(PromptTemplate.created_at.desc())
        
        result = await self.db.execute(stmt)
        template = result.scalar_one_or_none()
        
        if not template:
            # 如果没有默认模板，返回第一个活跃的模板
            stmt = select(PromptTemplate).where(
                and_(
                    PromptTemplate.template_type == template_type,
                    PromptTemplate.is_active == True
                )
            ).order_by(PromptTemplate.created_at.desc())
            result = await self.db.execute(stmt)
            template = result.scalar_one_or_none()
        
        return template
    
    async def format_prompt(
        self,
        template: PromptTemplate,
        context: Optional[PromptContext] = None,
        work_id: Optional[int] = None,
        chapter_id: Optional[int] = None,
        additional_vars: Optional[Dict[str, Any]] = None,
        auto_build_context: bool = True
    ) -> str:
        """
        格式化prompt，替换变量（异步方法，可自动获取章节内容）
        支持中文变量名：{所有角色}、{章节角色}等
        支持从metadata获取：{作品.xxx}、{章节.xxx}
        
        Args:
            template: Prompt模板
            context: 上下文数据（如果为None且auto_build_context=True，会根据prompt需要的变量自动构建）
            work_id: 作品ID（当context为None时必需）
            chapter_id: 章节ID（可选）
            additional_vars: 额外的变量
            auto_build_context: 是否根据prompt需要的变量自动构建上下文
        
        Returns:
            格式化后的prompt字符串
        """
        # 如果context为None，根据prompt需要的变量自动构建
        if context is None and auto_build_context:
            if work_id is None:
                raise ValueError("当context为None时，必须提供work_id")
            
            # 提取prompt需要的变量
            requirements = self.extract_required_variables(template.prompt_content)
            
            # 根据需要的变量构建上下文
            context = await self.build_context(
                work_id=work_id,
                chapter_id=chapter_id,
                requirements=requirements
            )
        
        if context is None:
            raise ValueError("必须提供context或work_id")
        
        context_dict = context.to_dict()
        vars_dict = {}
        
        # 根据模板类型，提取需要的变量
        template_type = template.template_type
        
        # 基础变量（英文和中文）
        work_info = context_dict.get("work", {})
        vars_dict.update({
            # 英文变量
            "work_title": work_info.get("title", ""),
            "work_description": work_info.get("description", ""),
            "work_genre": work_info.get("genre", ""),
            # 中文变量
            "作品标题": work_info.get("title", ""),
            "作品描述": work_info.get("description", ""),
            "作品类型": work_info.get("genre", ""),
        })
        
        # 作品metadata对象（支持 {作品.xxx} 格式）
        if context.work:
            work_metadata = context.work.work_metadata or {}
            vars_dict["作品"] = work_metadata
            # 同时提供work_metadata作为英文键
            vars_dict["work_metadata"] = work_metadata
        
        # 角色相关变量（英文和中文）
        all_chars = context_dict.get("all_characters", [])
        chapter_chars = context_dict.get("chapter_characters", [])
        
        all_chars_formatted = self._format_characters_list(all_chars)
        chapter_chars_formatted = self._format_characters_list(chapter_chars)
        
        vars_dict.update({
            # 英文变量
            "all_characters": all_chars_formatted,
            "chapter_characters": chapter_chars_formatted,
            # 中文变量
            "所有角色": all_chars_formatted,
            "章节角色": chapter_chars_formatted,
        })
        
        # 章节相关变量
        current_chapter = context_dict.get("current_chapter", {})
        vars_dict.update({
            # 英文变量
            "current_chapter_title": current_chapter.get("title", ""),
            "current_chapter_number": current_chapter.get("chapter_number", ""),
            "current_chapter_summary": current_chapter.get("summary", ""),
            # 中文变量
            "章节标题": current_chapter.get("title", ""),
            "章节号": str(current_chapter.get("chapter_number", "")),
            "章节摘要": current_chapter.get("summary", ""),
        })
        
        # 章节metadata对象（支持 {章节.xxx} 格式）
        if context.current_chapter:
            chapter_metadata = context.current_chapter.chapter_metadata or {}
            vars_dict["章节"] = chapter_metadata
            # 同时提供chapter_metadata作为英文键
            vars_dict["chapter_metadata"] = chapter_metadata
            
            # 如果需要章节内容，自动从ShareDB获取
            if "content" not in (additional_vars or {}) and "章节内容" not in (additional_vars or {}):
                try:
                    document = await self.sharedb_service.get_document(
                        f"chapter_{context.current_chapter.id}"
                    )
                    if document:
                        content = document.get("content", "")
                        vars_dict["content"] = content
                        vars_dict["章节内容"] = content
                    else:
                        vars_dict["content"] = ""
                        vars_dict["章节内容"] = ""
                except Exception as e:
                    logger.warning(f"获取章节内容失败: {e}")
                    vars_dict["content"] = ""
                    vars_dict["章节内容"] = ""
        
        # 前文信息（英文和中文）
        previous_chapters = context_dict.get("previous_chapters", [])
        previous_content = context_dict.get("previous_chapters_content", [])
        previous_outlines = context_dict.get("previous_outlines", [])
        previous_detailed_outlines = context_dict.get("previous_detailed_outlines", [])
        
        previous_summary = self._format_previous_chapters_summary(previous_chapters)
        previous_content_str = "\n\n".join(previous_content)
        previous_outlines_str = self._format_outlines(previous_outlines)
        previous_detailed_outlines_str = self._format_detailed_outlines(previous_detailed_outlines)
        
        vars_dict.update({
            # 英文变量
            "previous_chapters_summary": previous_summary,
            "previous_chapters_content": previous_content_str,
            "previous_outlines": previous_outlines_str,
            "previous_detailed_outlines": previous_detailed_outlines_str,
            # 中文变量
            "前文摘要": previous_summary,
            "前文内容": previous_content_str,
            "前文大纲": previous_outlines_str,
            "前文细纲": previous_detailed_outlines_str,
        })
        
        # 如果当前章节有大纲，添加到变量中（用于细纲生成）
        if context.current_chapter:
            metadata = context.current_chapter.chapter_metadata or {}
            outline = metadata.get("outline", {})
            if outline:
                outline_str = json.dumps(outline, ensure_ascii=False, indent=2)
                vars_dict["outline"] = outline_str
                vars_dict["大纲"] = outline_str
            else:
                vars_dict["outline"] = "无"
                vars_dict["大纲"] = "无"
        
        # 地点相关变量（英文和中文）
        locations = context_dict.get("locations", [])
        locations_formatted = self._format_locations_list(locations)
        vars_dict.update({
            "locations": locations_formatted,
            "地点": locations_formatted,
        })
        
        # 添加额外变量（会覆盖自动获取的变量）
        if additional_vars:
            vars_dict.update(additional_vars)
        
        # 使用模板的format_prompt方法
        return template.format_prompt(**vars_dict)
    
    def _format_characters_list(self, characters: List[Dict[str, Any]]) -> str:
        """格式化角色列表为字符串"""
        if not characters:
            return "无"
        
        lines = []
        for char in characters:
            char_info = f"- {char.get('name', '')}"
            if char.get('display_name'):
                char_info += f" ({char.get('display_name')})"
            if char.get('description'):
                char_info += f": {char.get('description')}"
            if char.get('personality'):
                personality = char.get('personality', {})
                if isinstance(personality, dict):
                    traits = personality.get('traits', [])
                    if traits:
                        char_info += f" | 性格: {', '.join(traits)}"
            lines.append(char_info)
        
        return "\n".join(lines)
    
    def _format_locations_list(self, locations: List[Dict[str, Any]]) -> str:
        """格式化地点列表为字符串"""
        if not locations:
            return "无"
        
        lines = []
        for loc in locations:
            loc_info = f"- {loc.get('name', '')}"
            if loc.get('description'):
                loc_info += f": {loc.get('description')}"
            lines.append(loc_info)
        
        return "\n".join(lines)
    
    def _format_previous_chapters_summary(self, chapters: List[Dict[str, Any]]) -> str:
        """格式化前文章节摘要"""
        if not chapters:
            return "无前文"
        
        lines = []
        for ch in chapters:
            ch_info = f"第{ch.get('chapter_number', '')}章: {ch.get('title', '')}"
            if ch.get('summary'):
                ch_info += f" - {ch.get('summary')}"
            lines.append(ch_info)
        
        return "\n".join(lines)
    
    def _format_outlines(self, outlines: List[Dict[str, Any]]) -> str:
        """格式化大纲列表"""
        if not outlines:
            return "无"
        
        lines = []
        for idx, outline in enumerate(outlines, 1):
            if not outline:
                continue
            lines.append(f"## 第{idx}章大纲")
            if outline.get('core_function'):
                lines.append(f"核心功能: {outline.get('core_function')}")
            if outline.get('key_points'):
                lines.append(f"关键情节点: {', '.join(outline.get('key_points', []))}")
            if outline.get('hook'):
                lines.append(f"结尾钩子: {outline.get('hook')}")
            lines.append("")
        
        return "\n".join(lines)
    
    def _format_detailed_outlines(self, detailed_outlines: List[Dict[str, Any]]) -> str:
        """格式化细纲列表"""
        if not detailed_outlines:
            return "无"
        
        lines = []
        for idx, detailed_outline in enumerate(detailed_outlines, 1):
            if not detailed_outline:
                continue
            lines.append(f"## 第{idx}章细纲")
            sections = detailed_outline.get('sections', [])
            for section in sections:
                section_num = section.get('section_number', '')
                section_title = section.get('title', '')
                section_content = section.get('content', '')
                lines.append(f"  {section_num}. {section_title}: {section_content}")
            lines.append("")
        
        return "\n".join(lines)
    
    async def process_ai_response(
        self,
        template_type: str,
        ai_response: str,
        context: PromptContext,
        work_id: int,
        user_id: int
    ) -> Dict[str, Any]:
        """
        处理AI响应，解析并存储到数据库
        
        Args:
            template_type: 模板类型
            ai_response: AI返回的响应
            context: 上下文数据
            work_id: 作品ID
            user_id: 用户ID
        
        Returns:
            处理结果字典
        """
        try:
            # 根据模板类型解析响应
            if template_type in ["character_generation", "character_extraction"]:
                return await self._process_character_response(
                    ai_response, context, work_id, user_id
                )
            elif template_type in ["chapter_generation"]:
                return await self._process_chapter_response(
                    ai_response, context, work_id, user_id
                )
            elif template_type in ["chapter_summary", "outline_generation", "detailed_outline_generation"]:
                return await self._process_chapter_metadata_response(
                    ai_response, context, template_type, user_id
                )
            elif template_type in ["book_analysis", "chapter_analysis"]:
                # 使用现有的BookAnalysisService处理
                from memos.api.services.book_analysis_service import BookAnalysisService
                analysis_service = BookAnalysisService(self.db)
                if template_type == "book_analysis":
                    parsed_data = analysis_service.parse_ai_response(ai_response)
                    return await analysis_service.create_work_from_analysis(parsed_data, user_id)
                else:
                    parsed_data = analysis_service.parse_single_chapter_response(ai_response)
                    if parsed_data and context.current_chapter:
                        # 更新章节的大纲和细纲
                        await self.chapter_service.update_chapter(
                            context.current_chapter.id,
                            chapter_metadata={
                                "outline": parsed_data.get("outline", {}),
                                "detailed_outline": parsed_data.get("detailed_outline", {}),
                            }
                        )
                        return {
                            "success": True,
                            "chapter_id": context.current_chapter.id,
                            "outline": parsed_data.get("outline", {}),
                            "detailed_outline": parsed_data.get("detailed_outline", {}),
                        }
            else:
                # 默认处理：返回原始响应
                return {
                    "success": True,
                    "raw_response": ai_response,
                }
        except Exception as e:
            logger.error(f"处理AI响应失败: {e}")
            raise
    
    async def _process_character_response(
        self,
        ai_response: str,
        context: PromptContext,
        work_id: int,
        user_id: int
    ) -> Dict[str, Any]:
        """处理角色相关的AI响应"""
        try:
            # 解析JSON响应
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', ai_response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    raise ValueError("无法在AI响应中找到JSON数据")
            
            data = json.loads(json_str)
            
            # 处理单个角色或多个角色
            characters_data = []
            if isinstance(data, list):
                characters_data = data
            elif isinstance(data, dict):
                if "characters" in data:
                    characters_data = data["characters"]
                elif "character" in data:
                    characters_data = [data["character"]]
                else:
                    # 假设整个对象就是一个角色
                    characters_data = [data]
            
            created_characters = []
            for char_data in characters_data:
                char_name = char_data.get("name", "").strip()
                if not char_name:
                    continue
                
                # 检查角色是否已存在
                stmt = select(Character).where(
                    and_(
                        Character.work_id == work_id,
                        Character.name == char_name
                    )
                )
                result = await self.db.execute(stmt)
                existing_char = result.scalar_one_or_none()
                
                if existing_char:
                    # 更新现有角色
                    if char_data.get("description") and not existing_char.description:
                        existing_char.description = char_data.get("description")
                    if char_data.get("gender") and not existing_char.gender:
                        existing_char.gender = char_data.get("gender")
                    if char_data.get("age") and not existing_char.age:
                        existing_char.age = char_data.get("age")
                    
                    # 合并其他字段
                    if char_data.get("personality"):
                        existing_personality = existing_char.personality or {}
                        existing_personality.update(char_data.get("personality", {}))
                        existing_char.personality = existing_personality
                    
                    created_characters.append(existing_char)
                else:
                    # 创建新角色
                    character = Character(
                        work_id=work_id,
                        name=char_name,
                        display_name=char_data.get("display_name"),
                        description=char_data.get("description"),
                        gender=char_data.get("gender"),
                        age=char_data.get("age"),
                        personality=char_data.get("personality", {}),
                        appearance=char_data.get("appearance", {}),
                        background=char_data.get("background", {}),
                        is_main_character=char_data.get("is_main_character", False),
                        tags=char_data.get("tags", []),
                    )
                    self.db.add(character)
                    created_characters.append(character)
            
            await self.db.commit()
            
            return {
                "success": True,
                "characters_count": len(created_characters),
                "characters": [char.to_dict() for char in created_characters],
            }
        except Exception as e:
            logger.error(f"处理角色响应失败: {e}")
            await self.db.rollback()
            raise
    
    async def _process_chapter_response(
        self,
        ai_response: str,
        context: PromptContext,
        work_id: int,
        user_id: int
    ) -> Dict[str, Any]:
        """处理章节生成的AI响应"""
        try:
            # 解析JSON响应
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', ai_response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    raise ValueError("无法在AI响应中找到JSON数据")
            
            data = json.loads(json_str)
            
            # 获取下一个章节号
            next_chapter_number = await self.chapter_service.get_max_chapter_number(work_id) + 1
            if context.current_chapter:
                next_chapter_number = context.current_chapter.chapter_number + 1
            
            # 创建新章节
            chapter = await self.chapter_service.create_chapter(
                work_id=work_id,
                title=data.get("title", f"第{next_chapter_number}章"),
                chapter_number=next_chapter_number,
                summary=data.get("summary"),
                chapter_metadata={
                    "outline": data.get("outline", {}),
                    "detailed_outline": data.get("detailed_outline", {}),
                },
            )
            
            # 在ShareDB中保存内容
            chapter_content = data.get("content", "")
            if chapter_content:
                await self.sharedb_service.create_document(
                    document_id=f"chapter_{chapter.id}",
                    initial_content={
                        "title": chapter.title,
                        "content": chapter_content,
                        "metadata": {
                            "work_id": work_id,
                            "chapter_number": next_chapter_number,
                            "created_by": user_id,
                        }
                    }
                )
            
            # 更新作品统计
            await self.work_service.update_work(
                work_id=work_id,
                chapter_count=context.work.chapter_count + 1 if context.work else 1,
            )
            
            return {
                "success": True,
                "chapter_id": chapter.id,
                "chapter_number": next_chapter_number,
                "title": chapter.title,
            }
        except Exception as e:
            logger.error(f"处理章节响应失败: {e}")
            await self.db.rollback()
            raise
    
    async def _process_chapter_metadata_response(
        self,
        ai_response: str,
        context: PromptContext,
        template_type: str,
        user_id: int
    ) -> Dict[str, Any]:
        """处理章节元数据（大纲、细纲、总结）的AI响应"""
        if not context.current_chapter:
            raise ValueError("当前章节不存在")
        
        try:
            # 解析JSON响应
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', ai_response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    raise ValueError("无法在AI响应中找到JSON数据")
            
            data = json.loads(json_str)
            
            # 更新章节元数据
            current_metadata = context.current_chapter.chapter_metadata or {}
            
            if template_type == "chapter_summary":
                # 更新总结
                await self.chapter_service.update_chapter(
                    context.current_chapter.id,
                    summary=data.get("summary", ""),
                )
                return {
                    "success": True,
                    "chapter_id": context.current_chapter.id,
                    "summary": data.get("summary", ""),
                }
            elif template_type == "outline_generation":
                # 更新大纲
                current_metadata["outline"] = data.get("outline", {})
                await self.chapter_service.update_chapter(
                    context.current_chapter.id,
                    chapter_metadata=current_metadata,
                )
                return {
                    "success": True,
                    "chapter_id": context.current_chapter.id,
                    "outline": data.get("outline", {}),
                }
            elif template_type == "detailed_outline_generation":
                # 更新细纲
                current_metadata["detailed_outline"] = data.get("detailed_outline", {})
                await self.chapter_service.update_chapter(
                    context.current_chapter.id,
                    chapter_metadata=current_metadata,
                )
                return {
                    "success": True,
                    "chapter_id": context.current_chapter.id,
                    "detailed_outline": data.get("detailed_outline", {}),
                }
            else:
                return {
                    "success": True,
                    "raw_data": data,
                }
        except Exception as e:
            logger.error(f"处理章节元数据响应失败: {e}")
            await self.db.rollback()
            raise

