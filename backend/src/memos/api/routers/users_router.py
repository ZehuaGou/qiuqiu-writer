"""
用户路由 - Token 信息等用户相关端点
"""

from fastapi import APIRouter, Depends

from memos.api.core.security import get_current_user_id
from memos.api.services.token_service import TokenService
from memos.api.services.media_credit_service import MediaCreditService
from memos.api.core.token_plans import get_plan_configs
from memos.api.core.media_credit_plans import (
    get_image_model_configs,
    get_video_model_configs,
    get_media_credit_packs,
)

router = APIRouter(prefix="/api/v1/users", tags=["Users"])
_media_credit_service = MediaCreditService()


@router.get("/me/token-info")
async def get_my_token_info(
    current_user_id: str = Depends(get_current_user_id),
):
    """获取当前用户的 Token 配额信息"""
    service = TokenService()
    return await service.get_user_token_info(current_user_id)


@router.get("/me/media-credits")
async def get_my_media_credits(
    current_user_id: str = Depends(get_current_user_id),
):
    """获取当前用户媒体 credits 余额（图像/视频共享）"""
    return await _media_credit_service.get_balance(current_user_id)


@router.get("/plans", include_in_schema=True)
async def get_plans():
    """公开接口：返回套餐配置列表（无需登录）"""
    return await get_plan_configs()


@router.get("/media-models", include_in_schema=True)
async def get_media_models():
    """公开接口：返回图像/视频模型定价配置"""
    return {
        "image": await get_image_model_configs(),
        "video": await get_video_model_configs(),
    }


@router.get("/media-packs", include_in_schema=True)
async def get_media_packs():
    """公开接口：返回统一媒体充值包配置"""
    return await get_media_credit_packs()
