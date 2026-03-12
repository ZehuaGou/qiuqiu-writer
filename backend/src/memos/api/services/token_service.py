"""
Token 计费服务
处理配额检查、用量记录、月度重置等
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.sql import func

from memos.api.core.database import AsyncSessionLocal
from memos.api.core.token_plans import get_plan_quotas, DEFAULT_PLAN_CONFIGS, MIN_TOKENS_TO_ALLOW_REQUEST
from memos.api.models.user import User
from memos.api.models.token_usage_log import TokenUsageLog
from memos.log import get_logger

logger = get_logger(__name__)


class QuotaExceededError(Exception):
    """用户 Token 配额不足，调用方可将其转为 HTTP 402"""
    pass


def _next_month_first_day() -> datetime:
    """返回下月 1 日 00:00:00 UTC"""
    now = datetime.now(timezone.utc)
    if now.month == 12:
        return now.replace(year=now.year + 1, month=1, day=1,
                           hour=0, minute=0, second=0, microsecond=0)
    return now.replace(month=now.month + 1, day=1,
                       hour=0, minute=0, second=0, microsecond=0)


class TokenService:
    """Token 计费核心服务"""

    async def check_token_quota(self, user_id: str) -> bool:
        """
        检查用户 token 余额是否满足最低请求阈值。
        同时触发月度重置（如果已到期）。

        Returns:
            True 表示允许请求，False 表示余额不足
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).where(User.id == user_id)
            )
            user = result.scalar_one_or_none()
            if not user:
                logger.warning(f"check_token_quota: user {user_id} not found")
                return False

            # 检查并执行月度重置
            now = datetime.now(timezone.utc)
            if user.token_reset_at and user.token_reset_at <= now:
                await self._reset_monthly_quota_inner(session, user)
                await session.commit()
                await session.refresh(user)

            remaining = user.token_remaining if user.token_remaining is not None else 0
            return remaining >= MIN_TOKENS_TO_ALLOW_REQUEST

    async def record_token_usage(
        self,
        user_id: str,
        input_tokens: int,
        output_tokens: int,
        total_tokens: int,
        feature: str,
        work_id: Optional[str] = None,
    ) -> None:
        """
        写入用量日志并原子扣减用户余额。
        使用独立 session，确保即使请求中断也能完成记录。
        """
        if total_tokens <= 0:
            return

        try:
            async with AsyncSessionLocal() as session:
                # 写入日志
                log = TokenUsageLog(
                    user_id=user_id,
                    feature=feature,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_tokens,
                    work_id=work_id,
                )
                session.add(log)

                # 原子扣减，防止负值
                await session.execute(
                    update(User)
                    .where(User.id == user_id)
                    .values(
                        token_remaining=func.greatest(
                            User.token_remaining - total_tokens, 0
                        )
                    )
                )

                await session.commit()
                logger.info(
                    f"record_token_usage: user={user_id}, feature={feature}, "
                    f"total={total_tokens}, input={input_tokens}, output={output_tokens}"
                )
        except Exception as e:
            logger.error(f"record_token_usage failed for user {user_id}: {e}")

    async def get_user_token_info(self, user_id: str) -> dict:
        """返回用户套餐、余额、总量、重置时间信息"""
        quotas = await get_plan_quotas()
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).where(User.id == user_id)
            )
            user = result.scalar_one_or_none()
            if not user:
                return {
                    "plan": "free",
                    "token_remaining": 0,
                    "token_total": quotas.get("free", next((p["tokens"] for p in DEFAULT_PLAN_CONFIGS if p["key"] == "free"), 0)),
                    "token_reset_at": None,
                    "plan_expires_at": None,
                }

            plan = user.plan or "free"
            token_total = quotas.get(plan, quotas.get("free", next((p["tokens"] for p in DEFAULT_PLAN_CONFIGS if p["key"] == "free"), 0)))
            return {
                "plan": plan,
                "token_remaining": user.token_remaining if user.token_remaining is not None else token_total,
                "token_total": token_total,
                "token_reset_at": user.token_reset_at.isoformat() if user.token_reset_at else None,
                "plan_expires_at": user.plan_expires_at.isoformat() if user.plan_expires_at else None,
            }

    async def set_user_plan(
        self,
        user_id: str,
        plan: str,
        expires_at: Optional[datetime] = None,
        override_remaining: Optional[int] = None,
    ) -> bool:
        """
        管理员设置用户套餐。
        如果 override_remaining 为 None，则重置为套餐满额。
        """
        quotas = await get_plan_quotas()
        if plan not in quotas:
            raise ValueError(f"无效套餐: {plan}，可选: {list(quotas.keys())}")

        new_remaining = override_remaining if override_remaining is not None else quotas[plan]
        next_reset = _next_month_first_day()

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).where(User.id == user_id)
            )
            user = result.scalar_one_or_none()
            if not user:
                return False

            user.plan = plan
            user.token_remaining = new_remaining
            user.token_reset_at = next_reset
            if expires_at is not None:
                user.plan_expires_at = expires_at

            await session.commit()
            logger.info(
                f"set_user_plan: user={user_id}, plan={plan}, "
                f"remaining={new_remaining}, reset_at={next_reset}"
            )
            return True

    async def _reset_monthly_quota_inner(self, session, user: User) -> None:
        """重置为套餐满额，并设置下次重置时间为次月 1 日（在已有 session 中执行）"""
        plan = user.plan or "free"
        quotas = await get_plan_quotas()
        quota = quotas.get(plan, quotas.get("free", next((p["tokens"] for p in DEFAULT_PLAN_CONFIGS if p["key"] == "free"), 0)))
        user.token_remaining = quota
        user.token_reset_at = _next_month_first_day()
        logger.info(
            f"月度重置: user={user.id}, plan={plan}, "
            f"new_remaining={quota}, next_reset={user.token_reset_at}"
        )
