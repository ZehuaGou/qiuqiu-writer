"""
用户路由 - Token 信息等用户相关端点
"""

from fastapi import APIRouter, Depends

from memos.api.core.security import get_current_user_id
from memos.api.services.token_service import TokenService
from memos.api.core.token_plans import get_plan_configs

router = APIRouter(prefix="/api/v1/users", tags=["Users"])


@router.get("/me/token-info")
async def get_my_token_info(
    current_user_id: str = Depends(get_current_user_id),
):
    """获取当前用户的 Token 配额信息"""
    service = TokenService()
    return await service.get_user_token_info(current_user_id)


@router.get("/plans", include_in_schema=True)
async def get_plans():
    """
    公开接口：返回套餐配置列表（无需登录）。
    前端用于展示套餐对比、升级提示等。
    """
    return await get_plan_configs()
