"""
媒体 Credits 配置

包含：
1. 模型定价配置（每次生成消耗的 credits 数，图像/视频分开管理）
2. 统一充值包配置（图像和视频共享同一 credits 余额）

存储在 system_settings 表。不存在时 fallback 到默认值。
"""
from typing import Any

# ── 默认图像模型配置 ────────────────────────────────────────────────────────────
DEFAULT_IMAGE_MODEL_CONFIGS: list[dict[str, Any]] = [
    {
        "model_id": "flux-1-schnell",
        "label": "Flux 1 Schnell",
        "description": "高速生成，适合快速出图",
        "credits_per_generation": 1,
        "enabled": True,
    },
    {
        "model_id": "flux-1-pro",
        "label": "Flux 1 Pro",
        "description": "高质量写实风格，细节丰富",
        "credits_per_generation": 2,
        "enabled": True,
    },
    {
        "model_id": "sdxl",
        "label": "Stable Diffusion XL",
        "description": "经典开源模型，风格多样",
        "credits_per_generation": 1,
        "enabled": True,
    },
    {
        "model_id": "dalle3",
        "label": "DALL·E 3",
        "description": "OpenAI 出品，文字理解能力强",
        "credits_per_generation": 3,
        "enabled": True,
    },
]

# ── 默认视频模型配置 ────────────────────────────────────────────────────────────
DEFAULT_VIDEO_MODEL_CONFIGS: list[dict[str, Any]] = [
    {
        "model_id": "wan-t2v",
        "label": "万象视频",
        "description": "国产高质量文生视频，5 秒片段",
        "credits_per_generation": 8,
        "enabled": True,
    },
    {
        "model_id": "kling-v1",
        "label": "可灵 1.0",
        "description": "流畅动态效果，5 秒片段",
        "credits_per_generation": 10,
        "enabled": True,
    },
    {
        "model_id": "kling-v2",
        "label": "可灵 2.0",
        "description": "电影级画质，支持 10 秒片段",
        "credits_per_generation": 20,
        "enabled": True,
    },
    {
        "model_id": "minimax-video",
        "label": "MiniMax 视频",
        "description": "角色一致性强，适合故事场景",
        "credits_per_generation": 15,
        "enabled": True,
    },
]

# ── 统一媒体充值包（图像/视频共享 credits）────────────────────────────────────
DEFAULT_MEDIA_CREDIT_PACKS: list[dict[str, Any]] = [
    {
        "pack_key": "media_pack_small",
        "label": "入门包",
        "credits": 50,
        "price": 9,
        "badge": None,
        "highlight": False,
    },
    {
        "pack_key": "media_pack_medium",
        "label": "标准包",
        "credits": 150,
        "price": 19,
        "badge": "推荐",
        "highlight": True,
    },
    {
        "pack_key": "media_pack_large",
        "label": "豪华包",
        "credits": 400,
        "price": 39,
        "badge": None,
        "highlight": False,
    },
]

_SETTING_KEYS = {
    "image_models": "image_model_configs",
    "video_models": "video_model_configs",
    "media_packs":  "media_credit_packs",
}

_DEFAULTS: dict[str, list[dict[str, Any]]] = {
    "image_model_configs": DEFAULT_IMAGE_MODEL_CONFIGS,
    "video_model_configs": DEFAULT_VIDEO_MODEL_CONFIGS,
    "media_credit_packs":  DEFAULT_MEDIA_CREDIT_PACKS,
}


async def _get_setting(key: str) -> list[dict[str, Any]]:
    try:
        from memos.api.core.database import AsyncSessionLocal
        from memos.api.models.system import SystemSetting
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(SystemSetting).where(SystemSetting.key == key)
            )
            setting = result.scalar_one_or_none()
            if setting and isinstance(setting.value, list) and setting.value:
                return setting.value
    except Exception:
        pass
    return [dict(item) for item in _DEFAULTS.get(key, [])]


async def _save_setting(key: str, configs: list[dict[str, Any]]) -> None:
    from memos.api.core.database import AsyncSessionLocal
    from memos.api.models.system import SystemSetting
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import flag_modified

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SystemSetting).where(SystemSetting.key == key)
        )
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = list(configs)
            flag_modified(setting, "value")
        else:
            setting = SystemSetting(
                key=key,
                value=configs,
                description=f"媒体 Credits 配置: {key}",
                category="media_credits",
                is_public=False,
            )
            session.add(setting)
        await session.commit()


async def get_image_model_configs() -> list[dict[str, Any]]:
    return await _get_setting(_SETTING_KEYS["image_models"])


async def get_video_model_configs() -> list[dict[str, Any]]:
    return await _get_setting(_SETTING_KEYS["video_models"])


async def get_media_credit_packs() -> list[dict[str, Any]]:
    return await _get_setting(_SETTING_KEYS["media_packs"])


async def save_image_model_configs(configs: list[dict[str, Any]]) -> None:
    await _save_setting(_SETTING_KEYS["image_models"], configs)


async def save_video_model_configs(configs: list[dict[str, Any]]) -> None:
    await _save_setting(_SETTING_KEYS["video_models"], configs)


async def save_media_credit_packs(configs: list[dict[str, Any]]) -> None:
    await _save_setting(_SETTING_KEYS["media_packs"], configs)


async def get_pack_by_key(pack_key: str) -> dict[str, Any] | None:
    """通过 pack_key 查找充值包"""
    for pack in await get_media_credit_packs():
        if pack.get("pack_key") == pack_key:
            return dict(pack)
    return None
