"""
媒体 Credits 充值订单模型
"""

import uuid
from sqlalchemy import Column, String, Float, Integer, Text, DateTime, JSON
from sqlalchemy.sql import func

from memos.api.core.database import Base


def _gen_order_id() -> str:
    return f"MC{uuid.uuid4().hex[:16].upper()}"


class MediaCreditOrder(Base):
    """媒体 Credits 充值订单表"""

    __tablename__ = "media_credit_orders"

    id = Column(String(40), primary_key=True, default=_gen_order_id)
    user_id = Column(String(40), nullable=False, index=True)
    order_type = Column(String(10), nullable=False)   # image / video
    pack_key = Column(String(50), nullable=False)
    pack_label = Column(String(100), nullable=False)
    credits = Column(Integer, nullable=False)          # 本次购买的 credits 数量
    method = Column(String(20), nullable=False)        # wechat / alipay
    amount = Column(Float, nullable=False)             # 单位：元
    status = Column(String(20), nullable=False, default="pending")  # pending / paid / failed / expired
    qr_url = Column(Text, nullable=True)
    notify_data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return (
            f"<MediaCreditOrder(id={self.id}, user_id={self.user_id}, "
            f"type={self.order_type}, credits={self.credits}, "
            f"amount={self.amount}, status={self.status})>"
        )
