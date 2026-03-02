import asyncio
import sys
import json
from pathlib import Path

# Add src to python path
backend_dir = Path(__file__).parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

from sqlalchemy.future import select
from memos.api.core.database import init_db, close_db, get_async_session
from memos.api.services.admin_service import AdminService
from memos.api.schemas.admin import AdminCreateRequest
from memos.api.models.template import WorkTemplate
from memos.api.models.prompt_template import PromptTemplate

async def init_admin_user(session):
    print("Initializing Default Admin User...")
    username = "admin"
    email = "admin@qiuqiu.com"
    password = "admin123456"
    display_name = "Administrator"
    
    admin_service = AdminService(session)
    existing_user = await admin_service.get_admin_by_username(username)
    if existing_user:
        print(f"ℹ️ Admin '{username}' already exists.")
        return existing_user

    req = AdminCreateRequest(
        username=username,
        email=email,
        password=password,
        display_name=display_name
    )
    user = await admin_service.create_admin(req)
    if user:
        print(f"✅ Admin created successfully!")
    return user

async def init_work_templates(session):
    print("Initializing Work Templates...")
    # Standard template data
    DEFAULT_TEMPLATES = [
        {
            "name": "小说标准模板",
            "description": "通用小说创作模板",
            "work_type": "novel",
            "category": "standard",
            "is_system": True,
            "is_public": True,
            "template_config": {
                "id": "novel-standard",
                "name": "小说标准模板",
                "description": "通用小说创作模板",
                "modules": [
                    {
                        "id": "basic-info",
                        "name": "基本信息",
                        "icon": "FileText",
                        "color": "#3b82f6",
                        "components": [
                            {
                                "id": "genre",
                                "type": "multiselect",
                                "label": "题材类型",
                                "config": {
                                    "options": [
                                        {"label": "言情", "value": "romance", "color": "#ec4899"},
                                        {"label": "悬疑", "value": "mystery", "color": "#8b5cf6"},
                                        {"label": "科幻", "value": "scifi", "color": "#06b6d4"},
                                        {"label": "玄幻", "value": "fantasy", "color": "#f59e0b"},
                                        {"label": "都市", "value": "urban", "color": "#10b981"},
                                    ],
                                    "maxCount": 3
                                },
                                "value": []
                            },
                            {
                                "id": "summary",
                                "type": "textarea",
                                "label": "作品简介",
                                "config": {"placeholder": "输入作品简介..."},
                                "value": ""
                            },
                            {
                                "id": "cover",
                                "type": "image",
                                "label": "封面图",
                                "config": {},
                                "value": ""
                            },
                        ]
                    },
                    {
                        "id": "characters",
                        "name": "角色设定",
                        "icon": "Users",
                        "color": "#8b5cf6",
                        "components": [
                            {
                                "id": "char-tabs",
                                "type": "tabs",
                                "label": "角色管理",
                                "config": {
                                    "tabs": [
                                        {
                                            "id": "list",
                                            "label": "角色列表",
                                            "components": [
                                                {
                                                    "id": "char-cards",
                                                    "type": "character-card",
                                                    "label": "角色卡片",
                                                    "config": {},
                                                    "value": []
                                                }
                                            ]
                                        }
                                    ]
                                },
                                "value": []
                            }
                        ]
                    }
                ]
            }
        }
    ]

    for tpl_data in DEFAULT_TEMPLATES:
        stmt = select(WorkTemplate).where(
            WorkTemplate.name == tpl_data["name"],
            WorkTemplate.is_system == True
        )
        result = await session.execute(stmt)
        if result.scalar_one_or_none():
            print(f"ℹ️ Template '{tpl_data['name']}' already exists.")
            continue
        
        template = WorkTemplate(**tpl_data)
        session.add(template)
        print(f"✅ Template '{tpl_data['name']}' created.")
    
    await session.commit()

async def init_prompts(session):
    print("Initializing Prompt Templates...")
    
    # Book Analysis Prompt
    stmt = select(PromptTemplate).where(
        PromptTemplate.template_type == "book_analysis",
        PromptTemplate.is_default == True
    )
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        content = """你是一位经验丰富的小说编辑。请分析以下内容，识别其中的角色、地点、章节大纲和细纲，并以结构化的 JSON 格式返回。
{content}"""
        template = PromptTemplate(
            name="增强拆书分析模板",
            description="用于拆书功能的增强分析模板",
            template_type="book_analysis",
            prompt_content=content,
            version="1.0",
            is_default=True,
            is_active=True,
            variables={"content": "章节内容"},
            template_metadata={"source": "system"}
        )
        session.add(template)
        print("✅ Book analysis prompt created.")

    # Chapter Analysis Prompt
    stmt = select(PromptTemplate).where(
        PromptTemplate.template_type == "chapter_analysis",
        PromptTemplate.is_default == True
    )
    result = await session.execute(stmt)
    if not result.scalar_one_or_none():
        content = """# 角色
你是一位经验丰富的小说编辑和金牌剧情分析师。你擅长解构故事，洞察每一章节的功能、节奏和情感，并能将其转化为高度结构化的分析报告。

# 任务
我将提供一部小说的章节正文。你的任务是通读并深刻理解这个章节，然后分析并提取以下信息：
1. 章节基本信息（标题、章节号、概要）
2. 章节大纲（核心功能、关键情节点、画面感、氛围、结尾钩子）
3. 章节细纲（详细的小节划分）

# 输出格式要求
**必须严格按照以下JSON格式输出，不要添加任何其他文字：**

```json
{
  "chapter_number": 章节号（数字）,
  "title": "章节标题",
  "summary": "章节概要（2-3句话）",
  "outline": {
    "core_function": "本章核心功能/目的",
    "key_points": ["关键情节点1", "关键情节点2"],
    "visual_scenes": ["画面1", "画面2"],
    "atmosphere": ["氛围1", "氛围2"],
    "hook": "结尾钩子"
  },
  "detailed_outline": {
    "sections": [
      {
        "section_number": 1,
        "title": "小节标题",
        "content": "小节内容概要"
      }
    ]
  }
}
```

# 重要提示
1. **必须输出有效的JSON格式**，不要添加任何Markdown代码块标记外的文字
2. 章节号必须准确提取，统一转换为阿拉伯数字
3. **每一章必须包含outline（大纲）和detailed_outline（细纲）字段**，这是必需字段，不能省略
4. outline字段必须包含：core_function（核心功能）、key_points（关键情节点）、visual_scenes（画面感）、atmosphere（氛围）、hook（结尾钩子）
5. detailed_outline字段必须包含sections数组，每个section包含section_number、title、content

# 章节内容
{content}

# 开始分析
请严格按照上述JSON格式输出分析结果："""
        template = PromptTemplate(
            name="章节分析模板（JSON格式）",
            description="用于章节分析的模板",
            template_type="chapter_analysis",
            prompt_content=content,
            version="1.0",
            is_default=True,
            is_active=True,
            variables={"content": "章节内容"}
        )
        session.add(template)
        print("✅ Chapter analysis prompt created.")
    
    await session.commit()

async def main():
    print("=" * 50)
    print("System Initialization")
    print("=" * 50)
    
    try:
        await init_db()
        print("✅ Database tables ensured.")
    except Exception as e:
        print(f"❌ Error initializing tables: {e}")
        return
    
    async for session in get_async_session():
        try:
            await init_admin_user(session)
            await init_work_templates(session)
            await init_prompts(session)
            print("=" * 50)
            print("✅ All initializations completed successfully!")
        except Exception as e:
            print(f"❌ Error during initialization: {e}")
        finally:
            break
            
    await close_db()

if __name__ == "__main__":
    asyncio.run(main())
