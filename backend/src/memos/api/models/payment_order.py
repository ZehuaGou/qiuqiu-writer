"""
支付订单模型
"""

import uuid
from sqlalchemy import Column, String, Float, Text, DateTime, JSON
from sqlalchemy.sql import func

from memos.api.core.database import Base


def _gen_order_id() -> str:
    return f"QQ{uuid.uuid4().hex[:16].upper()}"


class PaymentOrder(Base):
    """支付订单表，记录每笔订单的完整生命周期"""

    __tablename__ = "payment_orders"

    id = Column(String(40), primary_key=True, default=_gen_order_id)
    user_id = Column(String(40), nullable=False, index=True)
    plan_key = Column(String(50), nullable=False)
    plan_label = Column(String(100), nullable=False)
    cycle = Column(String(20), nullable=False)       # monthly / quarterly / yearly
    method = Column(String(20), nullable=False)      # wechat / alipay
    amount = Column(Float, nullable=False)           # 单位：元
    status = Column(String(20), nullable=False, default="pending")  # pending / paid / failed / expired
    qr_url = Column(Text, nullable=True)             # 用于生成二维码的字符串
    notify_data = Column(JSON, nullable=True)        # 支付平台原始回调数据
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return (
            f"<PaymentOrder(id={self.id}, user_id={self.user_id}, "
            f"plan={self.plan_key}, amount={self.amount}, status={self.status})>"
        )
