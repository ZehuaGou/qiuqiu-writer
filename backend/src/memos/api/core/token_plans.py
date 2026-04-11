"""
套餐配置

完整套餐信息（含标签、描述、配额、是否高亮、徽章文字）
存储在 system_settings 表（key: plan_configs）。
不存在时 fallback 到 DEFAULT_PLAN_CONFIGS。
"""
from typing import Any

# ── 默认套餐配置 ────────────────────────────────────────────────────────────
DEFAULT_PLAN_CONFIGS: list[dict[str, Any]] = [
    {
        "key": "free",
        "label": "免费版",
        "tokens": 100_000,
        "desc": "适合轻量创作体验",
        "highlight": False,
        "badge": None,
        "pricing": {
            "monthly":   {"original": 0,    "current": 0},
            "quarterly": {"original": 0,    "current": 0},
            "yearly":    {"original": 0,    "current": 0},
        },
    },
    {
        "key": "pro",
        "label": "专业版",
        "tokens": 1_500_000,
        "desc": "适合活跃写作用户",
        "highlight": True,
        "badge": "推荐",
        "pricing": {
            "monthly":   {"original": 99,   "current": 79},
            "quarterly": {"original": 267,  "current": 199},
            "yearly":    {"original": 948,  "current": 699},
        },
    },
    {
        "key": "creator",
        "label": "创作者版",
        "tokens": 5_000_000,
        "desc": "专业作者无限创作",
        "highlight": False,
        "badge": None,
        "pricing": {
            "monthly":   {"original": 299,  "current": 239},
            "quarterly": {"original": 807,  "current": 599},
            "yearly":    {"original": 2988, "current": 1999},
        },
    },
]

# 允许请求的最低 token 余额软阈值
MIN_TOKENS_TO_ALLOW_REQUEST = 100
TOKENS_PER_CHINESE_CHAR = 1.5

# 向后兼容：静态常量（不参与业务逻辑）
PLAN_TOKEN_QUOTAS = {p["key"]: p["tokens"] for p in DEFAULT_PLAN_CONFIGS}

_SETTING_KEY = "plan_configs"


async def get_plan_configs() -> list[dict[str, Any]]:
    """从 DB 读取完整套餐配置列表；失败或无记录时返回默认值。"""
    try:
        from memos.api.core.database import AsyncSessionLocal
        from memos.api.models.system import SystemSetting
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(SystemSetting).where(SystemSetting.key == _SETTING_KEY)
            )
            setting = result.scalar_one_or_none()
            if setting and isinstance(setting.value, list) and setting.value:
                return setting.value
    except Exception:
        pass
    return [dict(p) for p in DEFAULT_PLAN_CONFIGS]


async def save_plan_configs(configs: list[dict[str, Any]]) -> None:
    """将套餐配置列表写入 DB（upsert）。"""
    from memos.api.core.database import AsyncSessionLocal
    from memos.api.models.system import SystemSetting
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import flag_modified

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SystemSetting).where(SystemSetting.key == _SETTING_KEY)
        )
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = list(configs)
            flag_modified(setting, "value")
        else:
            setting = SystemSetting(
                key=_SETTING_KEY,
                value=configs,
                description="套餐配置（含标签、描述、Token 配额等）",
                category="plans",
                is_public=False,
            )
            session.add(setting)
        await session.commit()


async def get_plan_quotas() -> dict[str, int]:
    """返回 {plan_key: tokens} 映射，供 token_service 使用。"""
    configs = await get_plan_configs()
    return {p["key"]: int(p["tokens"]) for p in configs if "key" in p and "tokens" in p}
