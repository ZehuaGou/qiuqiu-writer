"""
Prompt模板模型
用于存储拆书功能和其他AI功能的提示词模板
"""

import json
import re
from datetime import datetime
from typing import Optional, Dict, Any, List, Set, Union
from memos.log import get_logger
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, JSON,
    Index, ForeignKey, select, and_, desc
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.core.database import Base

logger = get_logger(__name__)


def _extract_document_text(document: Optional[Dict[str, Any]]) -> str:
    """从 ShareDB 文档中提取正文文本。"""
    if not document:
        return ""
    content = document.get("content", "")
    if isinstance(content, dict):
        content = content.get("text", "") or json.dumps(content, ensure_ascii=False)
    return content if isinstance(content, str) else str(content)

# ---------------------------------------------------------------------------
# 预设：@ 占位符到 context 键的映射（用户自定义 prompt 时无需提前知道变量名，由此处统一解析）
# 所有可替换数据均来自 context：当前章 metadata/content、当前作品 metadata、前 n 章信息等
# ---------------------------------------------------------------------------
# 单段变量（如 @前文大纲、@previous_chapter_outlines）-> context 中的键名
# chapter_number 不传入模型，由后端在生成回复时按逻辑添加，故不提供 next_chapter_number / prev_chapter_number 占位
AT_VAR_TO_CONTEXT_KEY: Dict[str, str] = {
    "previous_chapter_outlines": "first_n_chapters_outlines",
    "前文大纲": "first_n_chapters_outlines",
    "previous_chapter_detailed_outlines": "first_n_chapters_detailed_outlines",
    "前文细纲": "first_n_chapters_detailed_outlines",
    "previous_chapter_content": "previous_chapter_content",
    "前一章正文": "previous_chapter_content",
}

# 前 n 章：@pre_chapter[n] = 下一章的前 n 章（如 n=1 为前一章/第9章，n=2 为前两章/第8+9章，n=3 为前三章/第7+8+9章）
# 支持 @pre_chapter[n] / @pre_chapter[n].content / @pre_chapter[n].metadata / @pre_chapter[n].metadata.outline，n 取值 1..PRE_CHAPTER_MAX
PRE_CHAPTER_MAX = 5


# 与 replace_at_var 中一致的 @ 占位符正则，用于扫描
_AT_PATTERN = re.compile(
    r"@(pre_chapter\[\d+\](?:\.[a-zA-Z0-9_]+)*|[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_.\u4e00-\u9fa5]*)"
)


def scan_required_pre_chapter_indices(template_content: str) -> Set[int]:
    """扫描模板中实际使用的 @pre_chapter[n]，只构建用到的 n，避免重复构建、加快执行。"""
    indices: Set[int] = set()
    for m in re.finditer(r"pre_chapter\[(\d+)\]", template_content):
        try:
            n = int(m.group(1))
            if 1 <= n <= PRE_CHAPTER_MAX:
                indices.add(n)
        except ValueError:
            pass
    return indices


def scan_required_placeholders(template_content: str) -> Dict[str, Any]:
    """扫描模板中实际使用的占位符，返回需要的 context 键（与 pre_chapter/chapter/work 同一逻辑：先扫键再按需构建）。

    调用方可根据返回结果只拉取/传入用到的数据，避免多余查询、加快执行。
    返回示例：
      - pre_chapter_indices: [1, 3]  仅当模板出现 @pre_chapter[n] 时存在
      - chapter: True                仅当模板出现 @chapter.* 时为 True
      - work: True                  仅当模板出现 @work.* 时为 True
      - previous_chapter_content / next_chapter_number / prev_chapter_number: True  单段变量
    """
    required: Dict[str, Any] = {}
    for m in _AT_PATTERN.finditer(template_content):
        var_path = m.group(1)
        if var_path.startswith("pre_chapter["):
            nm = re.match(r"pre_chapter\[(\d+)\]", var_path)
            if nm:
                try:
                    n = int(nm.group(1))
                    if 1 <= n <= PRE_CHAPTER_MAX:
                        indices = required.setdefault("pre_chapter_indices", set())
                        indices.add(n)
                except ValueError:
                    pass
            continue
        parts = var_path.split(".")
        if len(parts) == 1:
            key = AT_VAR_TO_CONTEXT_KEY.get(var_path) or var_path.replace(".", "_")
            required[key] = True
            continue
        if parts[0] == "chapter":
            required["chapter"] = True
            if "content" in parts or parts[1] == "content":
                required["chapter_content"] = True
        elif parts[0] == "work":
            required["work"] = True
    if "pre_chapter_indices" in required:
        required["pre_chapter_indices"] = sorted(required["pre_chapter_indices"])
    return required


def build_pre_chapters(
    chapter_infos: List[Dict[str, Any]],
    max_n: int = 3,
    content_max_len: int = 12000,
    required_indices: Optional[List[int]] = None,
) -> List[Dict[str, Any]]:
    """根据「下一章的前 n 章」语义构建 pre_chapters，供 @pre_chapter[1..n] 使用。

    chapter_infos: 按 chapter_number 升序的列表，每项需含
      - chapter_number, content, outline, detailed_outline
      - title（可选，默认「第X章」）
    返回 pre_chapters[i] 对应 @pre_chapter[i+1]：
      - pre_chapters[0] = 前一章（最后 1 章）
      - pre_chapters[1] = 前两章（最后 2 章合并）
      - pre_chapters[2] = 前三章（最后 3 章合并）
    """
    if not chapter_infos:
        return []

    def _item_for_one(info: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "content": (info.get("content") or "")[:content_max_len],
            "metadata": {
                "outline": info.get("outline") or {},
                "detailed_outline": info.get("detailed_outline") or {},
            },
        }

    def _item_for_many(infos: List[Dict[str, Any]]) -> Dict[str, Any]:
        parts = []
        outlines = []
        detailed_outlines = []
        for info in infos:
            num = info.get("chapter_number", 0)
            title = info.get("title") or f"第{num}章"
            sep = f"\n\n## 第{num}章 {title}\n\n"
            parts.append(sep + (info.get("content") or ""))
            outlines.append({"chapter_number": num, "outline": info.get("outline") or {}})
            detailed_outlines.append({
                "chapter_number": num,
                "detailed_outline": info.get("detailed_outline") or {},
            })
        content = "\n".join(parts)[:content_max_len]
        return {
            "content": content,
            "metadata": {"outline": outlines, "detailed_outline": detailed_outlines},
        }

    if required_indices:
        # 只构建模板中实际用到的 n，避免多余计算；保留空位使 pre_chapters[n-1] 对应 @pre_chapter[n]
        max_idx = min(max(required_indices), max_n, len(chapter_infos))
        pre_chapters = [None] * max_idx  # type: List[Optional[Dict[str, Any]]]
        for n in required_indices:
            if n < 1 or n > max_idx:
                continue
            k = n
            subset = chapter_infos[-k:]
            if not subset:
                continue
            if len(subset) == 1:
                pre_chapters[n - 1] = _item_for_one(subset[0])
            else:
                pre_chapters[n - 1] = _item_for_many(subset)
        return pre_chapters
    pre_chapters = []
    n = min(max_n, len(chapter_infos))
    for k in range(1, n + 1):
        subset = chapter_infos[-k:]
        if len(subset) == 1:
            pre_chapters.append(_item_for_one(subset[0]))
        else:
            pre_chapters.append(_item_for_many(subset))
    return pre_chapters


def build_context_for_continue_chapter(
    chapter_infos: List[Dict[str, Any]],
    previous_chapter_content: str,
    next_chapter_number: int,
    prev_chapter_number: int,
    max_pre_n: int = 3,
    content_max_len: int = 12000,
    required_pre_chapter_indices: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """构建 continue_chapter 模板所需的 context；仅构建模板中出现的 @pre_chapter[n]，避免重复构建。"""
    pre_chapters = build_pre_chapters(
        chapter_infos,
        max_n=max_pre_n,
        content_max_len=content_max_len,
        required_indices=required_pre_chapter_indices,
    )
    return {
        "pre_chapters": pre_chapters,
        "previous_chapter_content": previous_chapter_content,
        "next_chapter_number": next_chapter_number,
        "prev_chapter_number": prev_chapter_number,
    }


# ---------------------------------------------------------------------------
# 统一上下文加载：按模板占位符需求从 DB/ShareDB 拉取，不区分具体命令
# ---------------------------------------------------------------------------

async def _load_work(db: AsyncSession, work_id: str) -> Optional[Any]:
    """按 work_id 查询作品。"""
    from memos.api.models.work import Work
    stmt = select(Work).where(Work.id == work_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _load_chapter_with_content(
    db: AsyncSession,
    sharedb_service: Any,
    chapter_id: int,
    content_max_len: int = 12000,
) -> tuple[Optional[Any], str]:
    """按 chapter_id 查询章节并从 ShareDB 取正文，返回 (Chapter 或 None, 正文文本)。"""
    from memos.api.models.chapter import Chapter
    stmt = select(Chapter).where(Chapter.id == chapter_id)
    result = await db.execute(stmt)
    ch = result.scalar_one_or_none()
    if not ch:
        return None, ""
    doc_id = f"work_{ch.work_id}_chapter_{ch.id}"
    doc = await sharedb_service.get_document(doc_id)
    content = _extract_document_text(doc)
    return ch, (content[:content_max_len] if content else "")


async def _load_pre_chapter_ctx(
    db: AsyncSession,
    sharedb_service: Any,
    work_id: str,
    *,
    chapter_id: Optional[int] = None,
    previous_chapter_id: Optional[int] = None,
    max_n: int = 3,
    content_max_len: int = 12000,
) -> Dict[str, Any]:
    """统一加载「前 N 章 + 前一章正文」相关 ctx，支持三种模式：

    - previous_chapter_id 有值：续写模式，下一章的前 N 章 + 前一章正文。
    - chapter_id 有值（且无 previous_chapter_id）：当前章模式，当前章的前 N 章 + 前一章正文。
    - 仅 work_id：作品最后 N 章 + 最后一章正文。
    返回含 chapter_infos, previous_chapter_content；续写模式还含 next_chapter_number, prev_chapter_number。
    """
    from memos.api.models.chapter import Chapter

    # 1) 确定“锚点章”和“前 N 章”的上界
    if previous_chapter_id is not None:
        stmt = select(Chapter).where(
            Chapter.id == previous_chapter_id,
            Chapter.work_id == work_id,
        )
        result = await db.execute(stmt)
        prev_chapter = result.scalar_one_or_none()
        if not prev_chapter:
            raise ValueError(f"章节 {previous_chapter_id} 不存在或不属于本作品")
        next_chapter_number = (prev_chapter.chapter_number or 0) + 1
        prev_chapter_number = prev_chapter.chapter_number or 0
        upper = next_chapter_number  # 取 chapter_number < upper 的 N 章
    elif chapter_id is not None:
        stmt = select(Chapter).where(Chapter.id == chapter_id)
        result = await db.execute(stmt)
        cur = result.scalar_one_or_none()
        if not cur:
            raise ValueError(f"章节 {chapter_id} 不存在")
        upper = cur.chapter_number or 0  # 取 chapter_number < upper 的 N 章
        prev_chapter_number = 0
        next_chapter_number = 0
    else:
        # 仅 work_id：取最后 N 章
        stmt = (
            select(Chapter)
            .where(Chapter.work_id == work_id)
            .order_by(desc(Chapter.chapter_number))
            .limit(max_n + 1)
        )
        result = await db.execute(stmt)
        all_ch = list(reversed(result.scalars().all()))
        if not all_ch:
            raise ValueError("作品中没有章节")
        first_chapters = all_ch[:-1] if len(all_ch) > 1 else []
        prev_chapter = all_ch[-1]
        prev_chapter_number = prev_chapter.chapter_number or 0
        next_chapter_number = prev_chapter_number + 1  # 续写模式下，下一章号 = 最后一章号 + 1
        # 直接组装 chapter_infos 与 previous_chapter_content，然后 return
        chapter_infos = []
        for ch in first_chapters:
            doc_id = f"work_{ch.work_id}_chapter_{ch.id}"
            doc = await sharedb_service.get_document(doc_id)
            txt = _extract_document_text(doc)
            meta = ch.chapter_metadata or {}
            chapter_infos.append({
                "chapter_number": ch.chapter_number or 0,
                "title": getattr(ch, "title", None) or f"第{ch.chapter_number or 0}章",
                "content": (txt or "")[:content_max_len],
                "outline": meta.get("outline", {}),
                "detailed_outline": meta.get("detailed_outline", {}),
            })
        prev_doc_id = f"work_{prev_chapter.work_id}_chapter_{prev_chapter.id}"
        prev_doc = await sharedb_service.get_document(prev_doc_id)
        prev_txt = _extract_document_text(prev_doc)
        prev_content = (prev_txt[:content_max_len] if prev_txt else "（无正文）")
        return {
            "chapter_infos": chapter_infos,
            "previous_chapter_content": prev_content,
            "next_chapter_number": next_chapter_number,
            "prev_chapter_number": prev_chapter_number,
        }

    # 2) 取前 N 章（chapter_number < upper，降序取 N 再升序）
    stmt = (
        select(Chapter)
        .where(
            and_(
                Chapter.work_id == work_id,
                Chapter.chapter_number < upper,
            )
        )
        .order_by(desc(Chapter.chapter_number))
        .limit(max_n)
    )
    result = await db.execute(stmt)
    first_chapters = list(reversed(result.scalars().all()))
    if not first_chapters and previous_chapter_id is not None:
        raise ValueError("作品中没有章节，无法续写")

    # 3) 前一章（续写模式即 previous_chapter_id 对应章；当前章模式为当前章的前一章）
    if previous_chapter_id is not None:
        prev_chapter = prev_chapter  # 已查
    elif chapter_id is not None:
        stmt_prev = (
            select(Chapter)
            .where(
                and_(
                    Chapter.work_id == work_id,
                    Chapter.chapter_number < upper,
                )
            )
            .order_by(desc(Chapter.chapter_number))
            .limit(1)
        )
        res = await db.execute(stmt_prev)
        prev_chapter = res.scalar_one_or_none()
    else:
        prev_chapter = None

    # 4) 组装 chapter_infos
    chapter_infos = []
    for ch in first_chapters:
        doc_id = f"work_{ch.work_id}_chapter_{ch.id}"
        doc = await sharedb_service.get_document(doc_id)
        txt = _extract_document_text(doc)
        meta = ch.chapter_metadata or {}
        chapter_infos.append({
            "chapter_number": ch.chapter_number or 0,
            "title": getattr(ch, "title", None) or f"第{ch.chapter_number or 0}章",
            "content": (txt or "")[:content_max_len],
            "outline": meta.get("outline", {}),
            "detailed_outline": meta.get("detailed_outline", {}),
        })

    prev_content = "（无正文）"
    if prev_chapter is not None:
        prev_doc_id = f"work_{prev_chapter.work_id}_chapter_{prev_chapter.id}"
        prev_doc = await sharedb_service.get_document(prev_doc_id)
        prev_txt = _extract_document_text(prev_doc)
        prev_content = (prev_txt[:content_max_len] if prev_txt else "（无正文）")

    out = {
        "chapter_infos": chapter_infos,
        "previous_chapter_content": prev_content,
    }
    if previous_chapter_id is not None:
        out["next_chapter_number"] = next_chapter_number
        out["prev_chapter_number"] = prev_chapter_number
    return out


async def _load_ctx_by_requirements(
    db: AsyncSession,
    sharedb_service: Any,
    requirements: Dict[str, Any],
    work_id: Optional[str] = None,
    chapter_id: Optional[int] = None,
    previous_chapter_id: Optional[int] = None,
    content_max_len: int = 12000,
    max_pre_n: int = 3,
) -> Dict[str, Any]:
    """按 scan_required_placeholders 的结果只加载需要的项，组装完整 ctx。"""
    ctx: Dict[str, Any] = {}

    need_work = requirements.get("work")
    need_chapter = requirements.get("chapter") or requirements.get("chapter_content")
    need_pre = (
        "pre_chapter_indices" in requirements
        or requirements.get("previous_chapter_content")
        or requirements.get("first_n_chapters_outlines")
        or requirements.get("first_n_chapters_detailed_outlines")
    )

    if need_work and work_id:
        work = await _load_work(db, work_id)
        if work:
            ctx["work"] = work
            ctx["作品"] = work

    if need_chapter and chapter_id:
        ch, content = await _load_chapter_with_content(
            db, sharedb_service, chapter_id, content_max_len=content_max_len
        )
        if ch:
            ctx["chapter"] = ch
            ctx["章节"] = ch
            ctx["chapter_content"] = ctx["content"] = ctx["章节内容"] = content

    if need_pre and work_id:
        pre_ctx = await _load_pre_chapter_ctx(
            db,
            sharedb_service,
            work_id,
            chapter_id=chapter_id,
            previous_chapter_id=previous_chapter_id,
            max_n=max_pre_n,
            content_max_len=content_max_len,
        )
        ctx.update(pre_ctx)
        if pre_ctx.get("chapter_infos"):
            infos = pre_ctx["chapter_infos"]
            ctx["first_n_chapters_outlines"] = [i.get("outline") or {} for i in infos]
            ctx["first_n_chapters_detailed_outlines"] = [i.get("detailed_outline") or {} for i in infos]

    return ctx


async def render_prompt(
    template: Union["PromptTemplate", str],
    db: AsyncSession,
    sharedb_service: Any,
    work_id: Optional[str] = None,
    chapter_id: Optional[int] = None,
    previous_chapter_id: Optional[int] = None,
    additional_vars: Optional[Dict[str, Any]] = None,
    content_max_len: int = 12000,
    max_pre_n: int = 3,
    return_ctx: bool = False,
) -> Union[str, tuple[str, Dict[str, Any]]]:
    """统一入口：根据模板内容扫描占位符需求，按需加载上下文并格式化为完整 prompt。适配任意命令，无需为单独命令写加载逻辑。

    - template: PromptTemplate 实例或模板正文字符串。
    - db / sharedb_service: 用于查库与取正文。
    - work_id / chapter_id / previous_chapter_id: 按需传入（由模板占位符决定需要哪些）。
    - additional_vars: 额外变量，会合并进 ctx 并参与替换。
    - return_ctx: 为 True 时返回 (prompt_str, ctx)，便于调用方使用 ctx 中的字段（如 next_chapter_number）。
    默认返回已替换好的完整 prompt 字符串。
    """
    if isinstance(template, str):
        content = template
        tpl = PromptTemplate()
        tpl.prompt_content = content
    else:
        tpl = template
        content = tpl.prompt_content

    requirements = scan_required_placeholders(content)
    ctx = await _load_ctx_by_requirements(
        db,
        sharedb_service,
        requirements,
        work_id=work_id,
        chapter_id=chapter_id,
        previous_chapter_id=previous_chapter_id,
        content_max_len=content_max_len,
        max_pre_n=max_pre_n,
    )
    if additional_vars:
        ctx.update(additional_vars)
    prompt_str = tpl.format_prompt(**ctx)
    if return_ctx:
        return prompt_str, ctx
    return prompt_str





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
    creator_id = Column(String(40), ForeignKey("users.id"), nullable=True)
    
    # 组件相关字段（用于组件级别的prompt）
    component_id = Column(String(100), nullable=True, index=True)  # 组件ID（如：char-cards, cp-relations等）
    component_type = Column(String(50), nullable=True, index=True)  # 组件类型（如：character-card, relation-graph等）
    prompt_category = Column(String(20), nullable=True, index=True)  # prompt类别：generate（生成）或validate（验证）或analysis（分析）
    data_key = Column(String(100), nullable=True, index=True)  # 数据存储键（用于在 component_data 中存储数据）
    work_id = Column(String(40), ForeignKey("works.id", ondelete="CASCADE"), nullable=True, index=True)  # 关联的作品ID（如果prompt是作品级别的，向后兼容）
    work_template_id = Column(Integer, ForeignKey("work_templates.id", ondelete="CASCADE"), nullable=True, index=True)  # 关联的模板ID（如果prompt是模板级别的）
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=True, index=True)  # 关联的章节ID（如果prompt是章节级别的）
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    creator = relationship("User")
    work = relationship("Work", foreign_keys=[work_id])
    chapter = relationship("Chapter", foreign_keys=[chapter_id])

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
            "data_key": self.data_key,
            "work_id": self.work_id,
            "work_template_id": self.work_template_id,
            "chapter_id": self.chapter_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def format_prompt(self, **kwargs: Any) -> str:
        """格式化提示词：遍历模板中所有 @ 占位符，按预设规则解析并替换。数据均通过 kwargs 传入。

        与 pre_chapter/chapter/work 同一逻辑：先扫键再按需构建。任意模板只要传入 chapter_infos（列表）
        即会按需构建 pre_chapters（仅构建模板中出现的 @pre_chapter[n]），供 @pre_chapter[n].xxx 使用。
        chapter_number 不传入模型，由后端在生成回复时按逻辑添加。
        """
        ctx = dict(kwargs)
        chapter_infos = ctx.get("chapter_infos")
        if isinstance(chapter_infos, list):
            content = self.prompt_content
            required_indices = sorted(scan_required_pre_chapter_indices(content)) or None
            ctx["pre_chapters"] = build_pre_chapters(
                chapter_infos,
                max_n=ctx.get("max_pre_n", 3),
                content_max_len=ctx.get("content_max_len", 12000),
                required_indices=required_indices,
            )
            if "previous_chapter_content" not in ctx:
                ctx["previous_chapter_content"] = "（无正文）"
        ctx.pop("next_chapter_number", None)
        ctx.pop("prev_chapter_number", None)

        content = self.prompt_content

        def _get_val(val: Any) -> str:
            if val is None:
                return ''
            if isinstance(val, (dict, list)):
                return json.dumps(val, ensure_ascii=False, indent=2)
            return str(val)

        def _resolve_pre_chapter(var_path: str) -> str:
            # @pre_chapter[n] 或 @pre_chapter[n].content / .metadata / .metadata.outline，n 最大 PRE_CHAPTER_MAX
            m = re.match(r'pre_chapter\[(\d+)\](?:\.(.+))?', var_path)
            if not m:
                return ''
            try:
                n = int(m.group(1))
            except ValueError:
                return ''
            if n < 1 or n > PRE_CHAPTER_MAX:
                return ''
            pre_chapters = ctx.get('pre_chapters') or ctx.get('pre_chapters_list') or []
            if not isinstance(pre_chapters, list) or n > len(pre_chapters):
                return ''
            item = pre_chapters[n - 1]
            if not isinstance(item, dict):
                return _get_val(item)
            sub_path = m.group(2)  # 如 None, "content", "metadata", "metadata.outline"
            if not sub_path:
                return _get_val(item.get('content') or item.get('正文') or '')
            keys = sub_path.split('.')
            cur = item
            for k in keys:
                cur = cur.get(k) if isinstance(cur, dict) else None
            return _get_val(cur)

        def replace_at_var(match):
            var_path = match.group(1)
            parts = var_path.split('.')

            # 单段变量：按预设映射到 context 键，再从 context 取值
            if len(parts) == 1:
                if var_path.startswith('pre_chapter['):
                    return _resolve_pre_chapter(var_path)
                key = AT_VAR_TO_CONTEXT_KEY.get(var_path) or var_path.replace('.', '_')
                val = ctx.get(key)
                return _get_val(val)

            if len(parts) < 2:
                return ''

            # @chapter.xxx：从 context["chapter"] 与 context["chapter_content"] 解析
            if parts[0] == 'chapter':
                chapter_data = ctx.get('chapter') or ctx.get('章节')
                if not chapter_data:
                    if parts[1] == 'content':
                        return _get_val(ctx.get('chapter_content') or ctx.get('content') or ctx.get('章节内容'))
                    return ''

                if len(parts) == 2 and parts[1] == 'content':
                    return _get_val(
                        ctx.get('chapter_content') or ctx.get('content') or ctx.get('章节内容')
                        or (chapter_data.get('content', '') if isinstance(chapter_data, dict) else getattr(chapter_data, 'content', '') or '')
                    )

                if parts[1] == 'metadata':
                    if isinstance(chapter_data, dict):
                        meta = chapter_data.get('chapter_metadata') or chapter_data.get('metadata') or {}
                    else:
                        meta = getattr(chapter_data, 'chapter_metadata', None) or {}
                    if not isinstance(meta, dict):
                        meta = {}
                    if len(parts) == 2:
                        return _get_val(meta)
                    cur = meta
                    for key in parts[2:]:
                        cur = cur.get(key) if isinstance(cur, dict) else None
                    return _get_val(cur)

                if len(parts) == 2:
                    key = parts[1]
                    if isinstance(chapter_data, dict):
                        val = chapter_data.get(key, '')
                    else:
                        val = getattr(chapter_data, key, '') or ''
                    return _get_val(val)
                return ''

            # 前几章：@pre_chapter[n] / @pre_chapter[n].content / @pre_chapter[n].metadata.outline 等（与 @chapter 同处按键解析）
            if parts[0].startswith('pre_chapter['):
                return _resolve_pre_chapter(var_path)

            # @work.xxx：从 context["work"] 解析
            if parts[0] == 'work':
                work_data = ctx.get('work') or ctx.get('作品')
                if not work_data:
                    return ''

                if len(parts) >= 2 and parts[1] == 'metadata':
                    if isinstance(work_data, dict):
                        meta = work_data.get('work_metadata') or work_data.get('metadata') or {}
                    else:
                        meta = getattr(work_data, 'work_metadata', None) or getattr(work_data, 'metadata', None) or {}
                    if not isinstance(meta, dict):
                        meta = {}
                    if len(parts) == 2:
                        return _get_val(meta)
                    cur = meta
                    for key in parts[2:]:
                        cur = cur.get(key) if isinstance(cur, dict) else None
                    return _get_val(cur)

                if len(parts) == 2:
                    key = parts[1]
                    if isinstance(work_data, dict):
                        val = work_data.get(key, '')
                    else:
                        val = getattr(work_data, key, '') or ''
                    return _get_val(val)
                return ''

            # 未匹配的多段变量：用 var_path 或 var_path.replace('.','_') 从 context 查找
            key_flat = var_path.replace('.', '_')
            val = ctx.get(var_path)
            if val is None:
                val = ctx.get(key_flat)
            return _get_val(val)

        return re.sub(_AT_PATTERN, replace_at_var, content)


# 索引
Index("idx_prompt_templates_type", PromptTemplate.template_type)
Index("idx_prompt_templates_default", PromptTemplate.is_default)
Index("idx_prompt_templates_active", PromptTemplate.is_active)
Index("idx_prompt_templates_component", PromptTemplate.component_id, PromptTemplate.component_type)
Index("idx_prompt_templates_work_component", PromptTemplate.work_id, PromptTemplate.component_id, PromptTemplate.prompt_category)
Index("idx_prompt_templates_template_component", PromptTemplate.work_template_id, PromptTemplate.component_id, PromptTemplate.prompt_category)
Index("idx_prompt_templates_chapter_component", PromptTemplate.chapter_id, PromptTemplate.component_id, PromptTemplate.prompt_category)
Index("idx_prompt_templates_data_key", PromptTemplate.data_key)

