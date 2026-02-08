"""
邀请码服务：生成、列表、校验与消耗
"""

import secrets
from typing import List, Optional, Tuple

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.models.invitation_code import InvitationCode


def _generate_code() -> str:
    """生成一个随机邀请码（字母数字，易读）"""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 去掉易混淆的 0,O,1,I
    return "".join(secrets.choice(alphabet) for _ in range(8))


class InvitationCodeService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_batch(self, count: int = 100) -> List[str]:
        """
        批量生成邀请码，保证不重复。
        返回新生成的 code 列表。
        """
        codes: List[str] = []
        existing = set()
        result = await self.db.execute(select(InvitationCode.code))
        for row in result.scalars():
            existing.add(row)
        while len(codes) < count:
            code = _generate_code()
            if code not in existing and code not in codes:
                codes.append(code)
                existing.add(code)
        for code in codes:
            inv = InvitationCode(code=code, used=0)
            self.db.add(inv)
        await self.db.commit()
        return codes

    async def list_codes(
        self,
        page: int = 1,
        size: int = 50,
        used_only: Optional[bool] = None,
    ) -> Tuple[int, List[dict]]:
        """分页列出邀请码。used_only: True=仅已使用, False=仅未使用, None=全部"""
        base = select(InvitationCode)
        if used_only is True:
            base = base.where(InvitationCode.used == 1)
        elif used_only is False:
            base = base.where(InvitationCode.used == 0)
        # total
        count_q = select(func.count()).select_from(InvitationCode)
        if used_only is True:
            count_q = count_q.where(InvitationCode.used == 1)
        elif used_only is False:
            count_q = count_q.where(InvitationCode.used == 0)
        total_result = await self.db.execute(count_q)
        total = total_result.scalar() or 0
        # page
        q = base.order_by(InvitationCode.id.desc()).offset((page - 1) * size).limit(size)
        result = await self.db.execute(q)
        rows = result.scalars().all()
        items = [r.to_dict() for r in rows]
        return total, items

    async def get_by_code(self, code: str) -> Optional[InvitationCode]:
        """根据 code 查询一条记录（未使用）"""
        code = (code or "").strip().upper()
        if not code:
            return None
        result = await self.db.execute(
            select(InvitationCode).where(InvitationCode.code == code)
        )
        return result.scalar_one_or_none()

    async def consume(self, code: str, user_id: str) -> bool:
        """
        消耗邀请码：将 code 标记为已使用，并记录 user_id 和 used_at。
        若 code 不存在或已使用返回 False。
        """
        inv = await self.get_by_code(code)
        if not inv or inv.used != 0:
            return False
        from datetime import datetime, timezone

        inv.used = 1
        inv.used_by_user_id = user_id
        inv.used_at = datetime.now(timezone.utc)
        self.db.add(inv)
        await self.db.commit()
        return True
