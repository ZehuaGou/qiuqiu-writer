#!/usr/bin/env python3
"""
初始化"小说标准模板"各组件的 Prompt 模板
每个组件创建三个 prompt：generate（生成）、validate（校验）、analysis（分析）
"""

import asyncio
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "src"))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.future import select

from memos.api.core.config import get_settings
from memos.api.models.prompt_template import PromptTemplate
from memos.api.models.template import WorkTemplate

settings = get_settings()
engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ──────────────────────────────────────────────
# Prompt 定义
# 每条记录：(component_id, component_type, data_key, prompt_category, name, description, prompt_content)
# ──────────────────────────────────────────────
PROMPTS = [

    # ======== 基本信息 ========

    # genre - 题材类型
    (
        "genre", "multiselect", None, "generate",
        "题材类型 - 生成",
        "根据作品简介推荐适合的题材标签",
        """\
# 角色
你是一位资深编辑，擅长分析小说类型并精准定位题材。

# 任务
根据以下作品信息，从候选题材中推荐最契合的 1-3 个题材标签，并给出简短理由。

候选题材：言情、悬疑、科幻、玄幻、都市

# 作品信息
作品简介：@work.metadata.summary

# 输出格式（JSON）
```json
{
  "recommended": ["题材1", "题材2"],
  "reason": "推荐理由"
}
```\
""",
    ),
    (
        "genre", "multiselect", None, "validate",
        "题材类型 - 校验",
        "检查所选题材是否与作品内容相符",
        """\
# 角色
你是一位专业的文学顾问，负责审核作品题材标注的准确性。

# 任务
对照作品简介，判断已选题材是否恰当，指出不匹配之处并给出调整建议。

# 作品信息
已选题材：@work.metadata.genre
作品简介：@work.metadata.summary

# 输出格式（JSON）
```json
{
  "is_valid": true,
  "issues": ["问题描述（若无则为空列表）"],
  "suggestions": ["调整建议（若无则为空列表）"]
}
```\
""",
    ),
    (
        "genre", "multiselect", None, "analysis",
        "题材类型 - 分析",
        "分析所选题材的市场热度与创作要点",
        """\
# 角色
你是一位熟悉网文市场的分析师，了解各题材的读者偏好和创作规律。

# 任务
针对已选题材，提供市场热度评估、核心读者群体特征、以及该题材下的创作要点。

# 作品信息
已选题材：@work.metadata.genre

# 输出格式（JSON）
```json
{
  "market_heat": "高/中/低",
  "core_audience": "目标读者描述",
  "writing_tips": ["创作要点1", "创作要点2", "创作要点3"]
}
```\
""",
    ),

    # summary - 作品简介
    (
        "summary", "textarea", None, "generate",
        "作品简介 - 生成",
        "根据已有信息生成吸引人的作品简介",
        """\
# 角色
你是一位顶级文案策划，擅长为小说撰写能抓住读者眼球的简介。

# 任务
根据以下作品信息，生成一段 150-300 字的作品简介。要求：点明主角、核心冲突、故事钩子，语言流畅有张力。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
世界描述：@work.metadata.world-desc
主线剧情：@work.metadata.mainline

# 输出
直接输出简介正文，不需要额外说明。\
""",
    ),
    (
        "summary", "textarea", None, "validate",
        "作品简介 - 校验",
        "检查简介是否清晰展现核心冲突和吸引力",
        """\
# 角色
你是一位严格的编辑，负责审核作品简介的质量。

# 任务
评估当前简介在以下维度的表现，并指出改进方向：
1. 是否清晰介绍主角
2. 是否点明核心冲突
3. 是否包含吸引读者继续阅读的钩子
4. 语言是否流畅精炼

# 当前简介
@work.metadata.summary

# 输出格式（JSON）
```json
{
  "score": 85,
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["不足1", "不足2"],
  "improved_version": "改进后的简介（如有必要）"
}
```\
""",
    ),
    (
        "summary", "textarea", None, "analysis",
        "作品简介 - 分析",
        "分析简介的竞争力和读者吸引力",
        """\
# 角色
你是一位熟悉读者心理的市场分析师。

# 任务
从商业角度分析当前简介的市场竞争力，包括情感共鸣点、关键词吸引力、以及与同类题材的差异化。

# 当前简介
@work.metadata.summary

# 输出格式（JSON）
```json
{
  "appeal_score": 80,
  "emotional_hooks": ["情感钩子1", "情感钩子2"],
  "keywords": ["关键词1", "关键词2"],
  "differentiation": "与同类作品的差异化描述",
  "optimization_suggestions": ["优化建议1", "优化建议2"]
}
```\
""",
    ),

    # cover - 封面图
    (
        "cover", "image", None, "generate",
        "封面图 - 生成描述",
        "根据作品信息生成封面设计描述，供设计参考",
        """\
# 角色
你是一位擅长视觉设计的创意总监，了解各类小说封面的设计规律。

# 任务
根据作品信息，生成一段详细的封面设计描述，包括构图、主视觉元素、色调、氛围等。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
作品简介：@work.metadata.summary

# 输出格式（JSON）
```json
{
  "composition": "构图描述",
  "main_elements": ["元素1", "元素2"],
  "color_palette": "主色调描述",
  "atmosphere": "整体氛围",
  "reference_style": "参考风格"
}
```\
""",
    ),
    (
        "cover", "image", None, "validate",
        "封面图 - 校验",
        "评估封面是否符合题材风格和市场定位",
        """\
# 角色
你是一位资深书籍装帧顾问，对各类型小说封面有丰富的审美经验。

# 任务
根据作品的题材和调性，评估封面设计的合适程度，并提出改进建议。

# 作品信息
题材：@work.metadata.genre
作品简介：@work.metadata.summary

# 输出格式（JSON）
```json
{
  "is_suitable": true,
  "match_score": 80,
  "issues": ["问题描述"],
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "cover", "image", None, "analysis",
        "封面图 - 分析",
        "分析封面的视觉吸引力和市场定位",
        """\
# 角色
你是一位专注于网络文学的市场研究员，熟悉各平台封面的点击率规律。

# 任务
从市场角度分析封面的视觉竞争力，包括在书单中的辨识度、对目标读者的吸引力等。

# 作品信息
题材：@work.metadata.genre

# 输出格式（JSON）
```json
{
  "visibility_score": 75,
  "target_audience_fit": "与目标读者的匹配度描述",
  "competitive_analysis": "与同类封面的对比分析",
  "improvement_priority": ["优先改进项1", "优先改进项2"]
}
```\
""",
    ),

    # ======== 角色设定 ========

    # char-cards - 角色卡片
    (
        "char-cards", "character-card", "characters", "generate",
        "角色卡片 - 生成",
        "根据作品设定生成完整的角色档案",
        """\
# 角色
你是一位经验丰富的小说策划，擅长构建立体、有深度的角色体系。

# 任务
根据以下作品信息，生成主要角色的档案，包含主角（1-2名）和配角（2-3名），每个角色需包含基本信息、性格特点、背景故事和行为动机。

# 作品信息
题材：@work.metadata.genre
作品简介：@work.metadata.summary
主线剧情：@work.metadata.mainline
世界背景：@work.metadata.world-desc

# 输出格式（JSON）
```json
{
  "characters": [
    {
      "name": "角色姓名",
      "role": "protagonist/supporting/antagonist",
      "gender": "male/female/other",
      "age": "年龄或年龄段",
      "appearance": "外貌描述",
      "personality": ["性格特点1", "性格特点2"],
      "background": "背景故事",
      "motivation": "行为动机",
      "abilities": ["能力/技能1", "能力/技能2"]
    }
  ]
}
```\
""",
    ),
    (
        "char-cards", "character-card", "characters", "validate",
        "角色卡片 - 校验",
        "检查角色设定的完整性和内在一致性",
        """\
# 角色
你是一位专注于角色塑造的文学编辑，擅长发现角色设定中的漏洞和矛盾。

# 任务
审查当前角色列表，重点检查：
1. 角色信息是否完整（姓名、性格、动机等）
2. 角色性格与其背景故事是否自洽
3. 角色间是否有足够的对比和张力
4. 主角的成长弧光是否清晰

# 作品信息
作品简介：@work.metadata.summary
角色数据：@work.metadata.characters

# 输出格式（JSON）
```json
{
  "overall_score": 80,
  "character_issues": [
    {
      "character_name": "角色名",
      "issues": ["问题描述"]
    }
  ],
  "structural_issues": ["角色结构问题"],
  "suggestions": ["改进建议1", "改进建议2"]
}
```\
""",
    ),
    (
        "char-cards", "character-card", "characters", "analysis",
        "角色卡片 - 分析",
        "分析角色群体结构和故事张力",
        """\
# 角色
你是一位研究叙事结构的文学分析师，专注于角色在故事中的功能和关系。

# 任务
从叙事学角度分析当前角色体系，评估角色群体的完整性、功能分工和情感张力。

# 作品信息
题材：@work.metadata.genre
主线剧情：@work.metadata.mainline
角色数据：@work.metadata.characters

# 输出格式（JSON）
```json
{
  "ensemble_completeness": "角色体系完整度评估",
  "role_distribution": {
    "protagonist_count": 1,
    "supporting_count": 3,
    "antagonist_count": 1
  },
  "tension_sources": ["张力来源1", "张力来源2"],
  "missing_roles": ["建议补充的角色类型"],
  "standout_characters": ["最具潜力的角色及原因"]
}
```\
""",
    ),

    # char-relations - 人物关系
    (
        "char-relations", "relation-graph", "character_relations", "generate",
        "人物关系 - 生成",
        "根据角色列表构建合理的人物关系网络",
        """\
# 角色
你是一位擅长设计复杂人物关系的故事策划师。

# 任务
根据现有角色列表，为每对关键角色之间设计合理的关系，关系类型包括：亲属、朋友、敌对、恋人、师徒等。关系应服务于主线剧情，制造戏剧张力。

# 作品信息
主线剧情：@work.metadata.mainline
角色列表：@work.metadata.characters

# 输出格式（JSON）
```json
{
  "relations": [
    {
      "source": "角色A姓名",
      "target": "角色B姓名",
      "type": "family/friend/enemy/lover/mentor",
      "description": "关系详细描述",
      "tension_level": "high/medium/low"
    }
  ]
}
```\
""",
    ),
    (
        "char-relations", "relation-graph", "character_relations", "validate",
        "人物关系 - 校验",
        "检查人物关系是否清晰且无逻辑矛盾",
        """\
# 角色
你是一位专注于叙事逻辑的编辑，善于发现人物关系中的矛盾与漏洞。

# 任务
审查当前人物关系图，检查：
1. 关系是否存在逻辑矛盾（如 A 与 B 是朋友，但 B 与 A 是敌人）
2. 关系强度分配是否合理，是否存在孤立角色
3. 关系是否能为主线剧情提供足够的冲突驱动

# 作品信息
主线剧情：@work.metadata.mainline
人物关系：@work.metadata.character_relations

# 输出格式（JSON）
```json
{
  "is_consistent": true,
  "contradictions": ["矛盾描述"],
  "isolated_characters": ["孤立角色名"],
  "conflict_coverage": "冲突覆盖评估",
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "char-relations", "relation-graph", "character_relations", "analysis",
        "人物关系 - 分析",
        "分析人物关系对故事冲突和情感张力的影响",
        """\
# 角色
你是一位叙事结构分析师，擅长评估人物关系对故事驱动力的贡献。

# 任务
从叙事学角度分析当前人物关系网络，评估其对故事张力、情感层次和读者沉浸感的支撑。

# 作品信息
题材：@work.metadata.genre
人物关系：@work.metadata.character_relations

# 输出格式（JSON）
```json
{
  "network_complexity": "simple/moderate/complex",
  "key_relationship_pairs": [
    {"pair": "A-B", "dramatic_value": "戏剧价值描述"}
  ],
  "emotional_layers": ["情感层次1", "情感层次2"],
  "conflict_potential": "冲突潜力评分（1-10）",
  "optimization_suggestions": ["优化建议"]
}
```\
""",
    ),

    # char-timeline - 角色时间线
    (
        "char-timeline", "timeline", "character_timeline", "generate",
        "角色时间线 - 生成",
        "根据剧情和角色生成按时序排列的角色事件时间线",
        """\
# 角色
你是一位擅长构建故事时间轴的叙事策划师。

# 任务
根据主线剧情和角色设定，为关键角色生成时间线事件，标注故事中的重要节点：起点、转折、高潮、结局。

# 作品信息
主线剧情：@work.metadata.mainline
角色列表：@work.metadata.characters

# 输出格式（JSON）
```json
{
  "timeline": [
    {
      "time_label": "故事开端",
      "event": "事件描述",
      "characters_involved": ["角色A", "角色B"],
      "significance": "high/medium/low",
      "emotional_tone": "积极/消极/中性"
    }
  ]
}
```\
""",
    ),
    (
        "char-timeline", "timeline", "character_timeline", "validate",
        "角色时间线 - 校验",
        "检查时间线是否存在时序矛盾和逻辑漏洞",
        """\
# 角色
你是一位严谨的故事逻辑审核员，专门检查叙事时序问题。

# 任务
检查角色时间线，重点关注：
1. 时序是否存在矛盾（后发生的事件是否依赖于未发生的事件）
2. 关键角色在时间线上的行动轨迹是否合理
3. 时间线节奏是否均衡（是否有过于密集或空白的时期）

# 作品信息
角色时间线：@work.metadata.character_timeline

# 输出格式（JSON）
```json
{
  "is_consistent": true,
  "timeline_conflicts": ["冲突描述"],
  "pacing_issues": ["节奏问题描述"],
  "logic_gaps": ["逻辑漏洞描述"],
  "suggestions": ["修正建议"]
}
```\
""",
    ),
    (
        "char-timeline", "timeline", "character_timeline", "analysis",
        "角色时间线 - 分析",
        "分析时间线节奏和情感高潮分布",
        """\
# 角色
你是一位研究故事节奏的叙事分析师，擅长评估时间线对读者体验的影响。

# 任务
分析当前角色时间线的节奏分布、情感曲线和高潮点布局，评估其对读者阅读体验的影响。

# 作品信息
角色时间线：@work.metadata.character_timeline

# 输出格式（JSON）
```json
{
  "pacing_rhythm": "fast/balanced/slow",
  "climax_distribution": "高潮点分布描述",
  "emotional_curve": ["情感曲线描述"],
  "engagement_peaks": ["高吸引力节点"],
  "suggested_adjustments": ["调整建议"]
}
```\
""",
    ),

    # ======== 世界设定 ========

    # era - 时代背景
    (
        "era", "select", None, "generate",
        "时代背景 - 生成",
        "根据题材和剧情推荐最适合的时代背景",
        """\
# 角色
你是一位熟悉各类小说世界观构建的策划顾问。

# 任务
根据作品题材和简介，推荐最适合的时代背景，并说明理由。
可选时代：古代、现代、未来、架空

# 作品信息
题材：@work.metadata.genre
作品简介：@work.metadata.summary
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "recommended_era": "推荐时代",
  "reason": "推荐理由",
  "alternative": "备选时代及理由"
}
```\
""",
    ),
    (
        "era", "select", None, "validate",
        "时代背景 - 校验",
        "检查时代背景与故事情节是否协调一致",
        """\
# 角色
你是一位历史与世界观顾问，负责确保故事背景与情节的一致性。

# 任务
评估当前所选时代背景是否与作品题材、剧情和角色设定相符，指出潜在的不协调之处。

# 作品信息
已选时代：@work.metadata.era
题材：@work.metadata.genre
作品简介：@work.metadata.summary
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "is_consistent": true,
  "inconsistencies": ["不一致之处描述"],
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "era", "select", None, "analysis",
        "时代背景 - 分析",
        "分析所选时代背景的创作机遇与挑战",
        """\
# 角色
你是一位熟悉网络文学市场的创作策略分析师。

# 任务
针对当前所选时代背景，分析该背景下创作本题材故事的优势、挑战以及读者接受度。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era

# 输出格式（JSON）
```json
{
  "advantages": ["优势1", "优势2"],
  "challenges": ["挑战1", "挑战2"],
  "reader_acceptance": "读者接受度评估",
  "market_trend": "该背景+题材的市场趋势",
  "creative_tips": ["创作技巧1", "创作技巧2"]
}
```\
""",
    ),

    # world-desc - 世界描述
    (
        "world-desc", "textarea", None, "generate",
        "世界描述 - 生成",
        "根据题材和时代背景生成详细的世界描述",
        """\
# 角色
你是一位世界观构建专家，擅长为小说创作沉浸感强的故事背景。

# 任务
根据以下作品信息，生成一段 200-400 字的世界描述，涵盖地理环境、社会结构、文化风貌、核心矛盾等维度。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
主线剧情：@work.metadata.mainline

# 输出
直接输出世界描述正文，语言生动有代入感，不需要额外说明。\
""",
    ),
    (
        "world-desc", "textarea", None, "validate",
        "世界描述 - 校验",
        "检查世界描述的自洽性和内在逻辑完整性",
        """\
# 角色
你是一位专注于世界观审核的编辑，善于发现设定漏洞。

# 任务
审查当前世界描述，检查：
1. 世界描述是否自洽（内部逻辑是否矛盾）
2. 描述的详细程度是否足以支撑主线剧情
3. 世界的独特性是否足够（是否有鲜明的区别于其他作品的特色）

# 作品信息
时代背景：@work.metadata.era
世界描述：@work.metadata.world-desc
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "consistency_score": 85,
  "logic_issues": ["逻辑问题描述"],
  "depth_assessment": "描述深度评估",
  "uniqueness_score": 70,
  "improvement_suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "world-desc", "textarea", None, "analysis",
        "世界描述 - 分析",
        "分析世界观设定对故事的支撑度和创新性",
        """\
# 角色
你是一位研究奇幻与小说世界观的分析师，关注世界观设计对读者沉浸感的影响。

# 任务
从世界观设计的角度分析当前世界描述的创新性、完整性和对故事的支撑程度。

# 作品信息
世界描述：@work.metadata.world-desc
题材：@work.metadata.genre

# 输出格式（JSON）
```json
{
  "innovation_score": 75,
  "immersion_potential": "high/medium/low",
  "world_pillars": ["世界观核心支柱1", "世界观核心支柱2"],
  "story_support": "对故事的支撑度评估",
  "expansion_opportunities": ["可延伸扩展的方向"]
}
```\
""",
    ),

    # rules - 世界规则
    (
        "rules", "keyvalue", None, "generate",
        "世界规则 - 生成",
        "根据世界描述生成该世界的核心规则体系",
        """\
# 角色
你是一位专注于奇幻体系构建的世界观设计师，擅长制定逻辑自洽的世界规则。

# 任务
根据世界描述和题材，为故事世界设计 5-8 条核心规则，每条规则需包含名称和详细说明。
规则应涵盖：自然法则、社会规范、超自然/科技体系、禁忌或限制等维度。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
世界描述：@work.metadata.world-desc

# 输出格式（JSON）
```json
{
  "rules": [
    {
      "name": "规则名称",
      "description": "规则详细说明",
      "category": "自然/社会/超自然/科技/禁忌"
    }
  ]
}
```\
""",
    ),
    (
        "rules", "keyvalue", None, "validate",
        "世界规则 - 校验",
        "检查世界规则是否自洽、无矛盾且服务于剧情",
        """\
# 角色
你是一位逻辑严谨的世界观审核员，专门检查设定体系的内在一致性。

# 任务
审查当前世界规则，重点检查：
1. 规则之间是否存在矛盾
2. 规则是否与世界描述一致
3. 规则是否能为主线剧情创造有意义的约束和冲突

# 作品信息
世界描述：@work.metadata.world-desc
世界规则：@work.metadata.rules
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "consistency_score": 85,
  "rule_conflicts": ["矛盾描述"],
  "story_integration": "规则与剧情整合度评估",
  "missing_rules": ["建议补充的规则类型"],
  "suggestions": ["修正建议"]
}
```\
""",
    ),
    (
        "rules", "keyvalue", None, "analysis",
        "世界规则 - 分析",
        "分析世界规则对故事约束力和戏剧性的贡献",
        """\
# 角色
你是一位叙事系统分析师，研究世界规则如何驱动故事冲突和角色决策。

# 任务
分析当前世界规则体系对故事戏剧性的贡献，评估规则的约束力设计是否能催生有趣的冲突和角色选择。

# 作品信息
世界规则：@work.metadata.rules
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "constraint_strength": "strong/moderate/weak",
  "dramatic_rules": ["最具戏剧价值的规则"],
  "conflict_catalysts": ["能引发冲突的规则场景"],
  "plot_holes_risk": ["可能引发逻辑漏洞的规则"],
  "suggestions": ["优化建议"]
}
```\
""",
    ),

    # factions - 势力设定
    (
        "factions", "faction", "factions", "generate",
        "势力设定 - 生成",
        "根据世界观背景生成主要势力、组织或阵营",
        """\
# 角色
你是一位擅长政治格局设计的故事策划师，善于构建权力博弈的多方势力。

# 任务
根据世界观背景，生成故事中的 3-5 个主要势力，每个势力需包含名称、简介、内部等级、核心目标和与其他势力的关系。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
世界描述：@work.metadata.world-desc
世界规则：@work.metadata.rules

# 输出格式（JSON）
```json
{
  "factions": [
    {
      "name": "势力名称",
      "description": "势力简介",
      "hierarchy": ["最高层", "中层", "基层"],
      "goal": "核心目标",
      "territory": "控制范围",
      "strength": "strong/medium/weak",
      "allies": ["盟友势力"],
      "enemies": ["敌对势力"]
    }
  ]
}
```\
""",
    ),
    (
        "factions", "faction", "factions", "validate",
        "势力设定 - 校验",
        "检查势力设定的层次和相互关系是否合理",
        """\
# 角色
你是一位政治格局顾问，善于评估故事中势力分布的合理性。

# 任务
审查当前势力设定，检查：
1. 势力之间的强弱对比是否合理
2. 势力关系（盟友/敌对）是否存在矛盾
3. 势力体系是否能为主线剧情提供足够的冲突来源

# 作品信息
世界描述：@work.metadata.world-desc
势力设定：@work.metadata.factions
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "balance_score": 80,
  "relationship_conflicts": ["关系矛盾描述"],
  "story_conflict_potential": "冲突潜力评估",
  "missing_roles": ["建议补充的势力类型"],
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "factions", "faction", "factions", "analysis",
        "势力设定 - 分析",
        "分析势力格局对主线剧情的驱动力",
        """\
# 角色
你是一位专注于权力叙事的文学分析师，研究势力格局与剧情走向的关系。

# 任务
分析当前势力格局对主线剧情的推动作用，评估权力博弈能否为故事提供持续的张力和读者的期待感。

# 作品信息
势力设定：@work.metadata.factions
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "power_structure": "权力结构评估（单极/双极/多极）",
  "narrative_drive": "high/medium/low",
  "key_conflict_axes": ["核心对立轴1", "核心对立轴2"],
  "protagonist_positioning": "主角在势力格局中的定位分析",
  "story_potential": ["故事潜力挖掘方向"]
}
```\
""",
    ),

    # ======== 剧情设计 ========

    # mainline - 主线剧情
    (
        "mainline", "textarea", None, "generate",
        "主线剧情 - 生成",
        "根据角色设定和世界观构建完整的主线剧情",
        """\
# 角色
你是一位顶级故事策划师，擅长构建逻辑严密、情感饱满的叙事弧线。

# 任务
根据以下作品信息，生成一段 300-500 字的主线剧情描述，包含：故事起点、核心冲突升级过程、高潮决战、结局走向。结构遵循三幕式叙事。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
作品简介：@work.metadata.summary
角色设定：@work.metadata.characters
世界描述：@work.metadata.world-desc

# 输出
直接输出主线剧情正文，语言简洁有力，不需要额外说明。\
""",
    ),
    (
        "mainline", "textarea", None, "validate",
        "主线剧情 - 校验",
        "检查主线剧情的结构完整性和逻辑一致性",
        """\
# 角色
你是一位资深故事编辑，专注于叙事结构的完整性和逻辑自洽。

# 任务
审查当前主线剧情，检查：
1. 是否具备完整的三幕结构（起承转合）
2. 核心冲突是否贯穿始终并有合理升级
3. 情节逻辑是否自洽（是否有明显漏洞）
4. 结局是否与前期铺垫相符

# 主线剧情
@work.metadata.mainline

# 作品信息
题材：@work.metadata.genre
角色设定：@work.metadata.characters

# 输出格式（JSON）
```json
{
  "structure_score": 80,
  "structure_issues": ["结构问题描述"],
  "logic_issues": ["逻辑漏洞描述"],
  "conflict_arc": "冲突弧线评估",
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "mainline", "textarea", None, "analysis",
        "主线剧情 - 分析",
        "分析主线剧情的节奏和商业潜力",
        """\
# 角色
你是一位网络文学市场分析师，善于评估故事的商业价值和读者吸引力。

# 任务
从商业角度分析主线剧情的市场潜力，包括爽点设计、读者代入感、追更动力等维度。

# 作品信息
题材：@work.metadata.genre
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "commercial_score": 80,
  "hook_effectiveness": "钩子效果评估",
  "reader_immersion": "high/medium/low",
  "pacing_rhythm": "fast/balanced/slow",
  "key_attractions": ["核心卖点1", "核心卖点2"],
  "improvement_priorities": ["优先改进方向"]
}
```\
""",
    ),

    # conflicts - 核心冲突
    (
        "conflicts", "keyvalue", None, "generate",
        "核心冲突 - 生成",
        "提炼并细化故事中的核心冲突层次",
        """\
# 角色
你是一位专注于戏剧冲突设计的故事顾问，擅长构建多层次的叙事张力。

# 任务
根据主线剧情，提炼并细化 3-5 个核心冲突，每个冲突需包含冲突类型、冲突双方、冲突本质和对故事的影响。
冲突类型：人与人、人与自我、人与社会、人与自然、人与命运

# 作品信息
主线剧情：@work.metadata.mainline
角色设定：@work.metadata.characters
世界描述：@work.metadata.world-desc

# 输出格式（JSON）
```json
{
  "conflicts": [
    {
      "name": "冲突名称",
      "type": "人与人/人与自我/人与社会/人与自然/人与命运",
      "parties": ["冲突方A", "冲突方B"],
      "essence": "冲突本质描述",
      "story_impact": "对故事的影响",
      "intensity": "high/medium/low"
    }
  ]
}
```\
""",
    ),
    (
        "conflicts", "keyvalue", None, "validate",
        "核心冲突 - 校验",
        "检查各冲突是否层次分明且相互关联",
        """\
# 角色
你是一位叙事结构审核员，专注于评估冲突设计的合理性和完整性。

# 任务
审查当前核心冲突列表，检查：
1. 冲突之间是否层次分明（主次关系是否清晰）
2. 冲突是否相互关联、共同指向主题
3. 是否存在冗余或矛盾的冲突

# 核心冲突
@work.metadata.conflicts

# 作品信息
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "hierarchy_clarity": "high/medium/low",
  "redundant_conflicts": ["冗余冲突描述"],
  "missing_conflict_types": ["建议补充的冲突类型"],
  "thematic_alignment": "冲突与主题的契合度评估",
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "conflicts", "keyvalue", None, "analysis",
        "核心冲突 - 分析",
        "分析核心冲突对故事张力和主题深度的贡献",
        """\
# 角色
你是一位文学主题分析师，研究冲突设计与故事深度的关系。

# 任务
从主题表达角度分析当前核心冲突的设计，评估其对故事张力、人物成长和主题深度的综合贡献。

# 作品信息
核心冲突：@work.metadata.conflicts
主线剧情：@work.metadata.mainline
题材：@work.metadata.genre

# 输出格式（JSON）
```json
{
  "tension_contribution": "张力贡献评估",
  "thematic_depth": "主题深度评分（1-10）",
  "character_growth_catalysts": ["推动角色成长的冲突"],
  "reader_emotional_engagement": "读者情感投入分析",
  "conflict_evolution_suggestions": ["冲突升级方向建议"]
}
```\
""",
    ),

    # turning-points - 关键转折
    (
        "turning-points", "list", None, "generate",
        "关键转折 - 生成",
        "根据主线剧情设计具有戏剧性的关键转折点",
        """\
# 角色
你是一位故事节奏大师，擅长在恰当的时机设置出人意料又在情理之中的转折。

# 任务
根据主线剧情，设计 3-6 个关键转折点，每个转折点需明确发生时机、转折内容、读者情绪变化。

# 作品信息
主线剧情：@work.metadata.mainline
核心冲突：@work.metadata.conflicts
角色设定：@work.metadata.characters

# 输出格式（JSON）
```json
{
  "turning_points": [
    {
      "name": "转折名称",
      "timing": "故事前段/中段/后段",
      "description": "转折内容描述",
      "trigger": "触发原因",
      "emotional_shift": "读者情绪变化（如：惊喜/心痛/愤怒）",
      "plot_impact": "对后续剧情的影响"
    }
  ]
}
```\
""",
    ),
    (
        "turning-points", "list", None, "validate",
        "关键转折 - 校验",
        "检查转折点是否具有足够戏剧性且符合逻辑",
        """\
# 角色
你是一位故事逻辑审核员，专注于检查情节转折的合理性。

# 任务
审查当前关键转折点列表，检查：
1. 每个转折是否有充分的前期铺垫（是否突兀）
2. 转折后的发展是否符合人物性格逻辑
3. 转折点的分布是否合理（是否集中或稀疏）

# 关键转折
@work.metadata.turning-points

# 作品信息
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "foreshadowing_adequacy": "铺垫充分度评估",
  "abrupt_turns": ["突兀转折描述"],
  "character_consistency_issues": ["性格逻辑问题"],
  "distribution_assessment": "分布合理性评估",
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "turning-points", "list", None, "analysis",
        "关键转折 - 分析",
        "分析转折点分布对读者体验和追更动力的影响",
        """\
# 角色
你是一位网络文学阅读体验研究员，专注于分析情节节奏对读者追更行为的影响。

# 任务
分析当前关键转折点的设计对读者追更动力的影响，评估转折节奏和情感冲击力是否能形成有效的"读者钩子"。

# 作品信息
关键转折：@work.metadata.turning-points
题材：@work.metadata.genre

# 输出格式（JSON）
```json
{
  "reader_hook_strength": "strong/moderate/weak",
  "most_impactful_turns": ["最具冲击力的转折"],
  "pacing_assessment": "节奏评估",
  "subscription_boost_points": ["预计带动订阅的转折点"],
  "emotional_variety": "情感多样性评估",
  "optimization_suggestions": ["优化建议"]
}
```\
""",
    ),
]


async def init_novel_standard_prompts():
    """为小说标准模板的每个组件初始化三个 prompt"""
    async with AsyncSessionLocal() as db:
        try:
            # 查找小说标准模板
            stmt = select(WorkTemplate).where(
                WorkTemplate.name == "小说标准模板",
                WorkTemplate.is_system == True,
            )
            result = await db.execute(stmt)
            template = result.scalar_one_or_none()

            if not template:
                print("❌ 未找到「小说标准模板」，请先运行 init_work_templates.py")
                return

            print(f"✅ 找到模板：{template.name}（ID: {template.id}）")
            print()

            created = 0
            skipped = 0

            for (comp_id, comp_type, data_key, category,
                 name, description, prompt_content) in PROMPTS:

                # 检查是否已存在
                check = select(PromptTemplate).where(
                    PromptTemplate.work_template_id == template.id,
                    PromptTemplate.component_id == comp_id,
                    PromptTemplate.prompt_category == category,
                )
                existing = (await db.execute(check)).scalar_one_or_none()

                if existing:
                    print(f"  ⏭  跳过（已存在）: {name}")
                    skipped += 1
                    continue

                pt = PromptTemplate(
                    name=name,
                    description=description,
                    template_type=f"component_{category}",
                    prompt_content=prompt_content,
                    version="1.0",
                    is_default=False,
                    is_active=True,
                    variables={},
                    template_metadata={},
                    usage_count=0,
                    component_id=comp_id,
                    component_type=comp_type,
                    prompt_category=category,
                    data_key=data_key,
                    work_template_id=template.id,
                )
                db.add(pt)
                print(f"  ✅ 创建: {name}")
                created += 1

            await db.commit()

            print()
            print("=" * 60)
            print(f"✅ 初始化完成！创建 {created} 条，跳过 {skipped} 条")
            print("=" * 60)

        except Exception as e:
            await db.rollback()
            print(f"❌ 初始化失败: {e}")
            import traceback
            traceback.print_exc()
            raise


async def main():
    print("=" * 60)
    print("初始化小说标准模板组件 Prompt")
    print("=" * 60)
    print()
    try:
        await init_novel_standard_prompts()
    except Exception as e:
        print(f"❌ 失败: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
