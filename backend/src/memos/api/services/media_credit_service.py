"""
媒体 Credits 计费服务

图像和视频共享同一 media_credits 余额。
"""

from sqlalchemy import select, update
from sqlalchemy.sql import func

from memos.api.core.database import AsyncSessionLocal
from memos.api.models.user import User
from memos.log import get_logger

logger = get_logger(__name__)


class CreditInsufficientError(Exception):
    """Credits 不足"""
    def __init__(self, required: int, remaining: int):
        self.required = required
        self.remaining = remaining
        super().__init__(f"media credits 不足：需要 {required}，剩余 {remaining}")


class MediaCreditService:

    async def get_balance(self, user_id: str) -> dict:
        """返回用户媒体 credits 余额"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                return {"media_credits": 0}
            return {"media_credits": user.media_credits or 0}

    async def check_and_deduct(
        self,
        user_id: str,
        model_id: str,
        credits_required: int,
    ) -> None:
        """
        检查余额并原子扣减。
        余额不足时抛出 CreditInsufficientError。
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                raise CreditInsufficientError(credits_required, 0)

            remaining = user.media_credits or 0
            if remaining < credits_required:
                raise CreditInsufficientError(credits_required, remaining)

            await session.execute(
                update(User)
                .where(User.id == user_id)
                .values(media_credits=func.greatest(User.media_credits - credits_required, 0))
            )
            await session.commit()

        logger.info(
            f"media_credit_deduct: user={user_id}, model={model_id}, deducted={credits_required}"
        )

    async def add_credits(self, user_id: str, amount: int) -> None:
        """充值：向用户账户添加 media credits（支付成功后调用）"""
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(User)
                .where(User.id == user_id)
                .values(media_credits=User.media_credits + amount)
            )
            await session.commit()

        logger.info(f"media_credit_add: user={user_id}, added={amount}")
