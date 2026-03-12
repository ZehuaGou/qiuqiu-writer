"""
支付服务：封装微信支付（Native）和支付宝（当面付）沙箱调用
PAYMENT_MOCK_MODE=true 时走本地模拟，无需真实商户凭证
"""

import logging
from typing import Optional

from memos.api.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ── 微信支付 ──────────────────────────────────────────────────────────────────

def _get_wechat_pay():
    """构造 WeChatPay 客户端（需要 wechatpayv3 库）"""
    from wechatpayv3 import WeChatPay, WeChatPayType

    private_key = _wrap_pem(settings.WECHAT_PAY_PRIVATE_KEY, "RSA PRIVATE KEY")

    return WeChatPay(
        wechatpay_type=WeChatPayType.NATIVE,
        mchid=settings.WECHAT_PAY_MCHID,
        private_key=private_key,
        cert_serial_no=settings.WECHAT_PAY_CERT_SERIAL,
        appid=settings.WECHAT_PAY_APPID,
        apiv3_key=settings.WECHAT_PAY_APIV3_KEY,
        notify_url=f"{settings.PAYMENT_NOTIFY_BASE_URL}/api/v1/payment/notify/wechat",
    )


async def create_wechat_order(order_id: str, plan_label: str, amount_yuan: float) -> str:
    """
    创建微信 Native 扫码订单，返回用于生成二维码的 code_url。
    沙箱：微信没有独立沙箱，但提供了仿真测试环境（同生产接口 + 特殊测试 MCHID）。
    """
    wx = _get_wechat_pay()
    code, message = wx.pay(
        description=f"球球写作 - {plan_label}",
        out_trade_no=order_id,
        amount={"total": int(round(amount_yuan * 100)), "currency": "CNY"},
    )
    if code == 200 and isinstance(message, dict) and message.get("code_url"):
        return message["code_url"]
    raise RuntimeError(f"微信支付下单失败 [{code}]: {message}")


def verify_wechat_callback(headers: dict, body: bytes) -> Optional[dict]:
    """验证并解密微信支付回调，返回解密后的订单数据；验证失败返回 None"""
    try:
        wx = _get_wechat_pay()
        result = wx.decrypt_callback(headers, body)
        return result
    except Exception as e:
        logger.error(f"微信支付回调验证失败: {e}")
        return None


# ── 支付宝 ────────────────────────────────────────────────────────────────────

def _wrap_pem(key: str, key_type: str) -> str:
    """
    如果密钥裸 base64（无 PEM 头），自动补充头尾。
    key_type: "RSA PRIVATE KEY" or "PUBLIC KEY"
    """
    key = key.replace("\\n", "\n").strip()
    header = f"-----BEGIN {key_type}-----"
    footer = f"-----END {key_type}-----"
    if key.startswith("-----"):
        return key  # 已有 PEM 格式，原样返回
    # 去掉已有换行，重新按 64 字符分行
    raw = key.replace("\n", "").replace("\r", "")
    lines = [raw[i:i+64] for i in range(0, len(raw), 64)]
    return "\n".join([header] + lines + [footer])


def _get_alipay():
    """构造 AliPay 客户端（需要 python-alipay-sdk 库）"""
    from alipay import AliPay

    private_key = _wrap_pem(settings.ALIPAY_PRIVATE_KEY, "RSA PRIVATE KEY")
    public_key = _wrap_pem(settings.ALIPAY_PUBLIC_KEY, "PUBLIC KEY")

    return AliPay(
        appid=settings.ALIPAY_APPID,
        app_notify_url=f"{settings.PAYMENT_NOTIFY_BASE_URL}/api/v1/payment/notify/alipay",
        app_private_key_string=private_key,
        alipay_public_key_string=public_key,
        sign_type="RSA2",
        debug=settings.ALIPAY_SANDBOX,  # True = 沙箱网关 openapi.alipaydev.com
    )


async def create_alipay_order(order_id: str, plan_label: str, amount_yuan: float) -> str:
    """
    创建支付宝当面付（预创建）订单，返回用于生成二维码的 qr_code 字符串。
    沙箱：ALIPAY_SANDBOX=true 时自动切换到 openapi.alipaydev.com。
    """
    alipay = _get_alipay()
    try:
        result = alipay.api_alipay_trade_precreate(
            subject=f"球球写作 - {plan_label}",
            out_trade_no=order_id,
            total_amount=f"{amount_yuan:.2f}",
        )
    except Exception as e:
        import traceback
        logger.error(f"支付宝 API 调用异常: {repr(e)}\n{traceback.format_exc()}")
        raise RuntimeError(f"支付宝 API 调用失败: {repr(e)}") from e

    logger.info(f"支付宝下单原始响应: {result!r}")
    if isinstance(result, dict) and result.get("code") == "10000":
        return result["qr_code"]
    raise RuntimeError(f"支付宝下单失败: {result}")


def verify_alipay_callback(data: dict, signature: str) -> bool:
    """验证支付宝异步通知签名"""
    try:
        alipay = _get_alipay()
        return alipay.verify(data, signature)
    except Exception as e:
        logger.error(f"支付宝回调验证失败: {e}")
        return False


# ── 主动查单（回调未到达时兜底）──────────────────────────────────────────────

async def query_wechat_order(order_id: str) -> Optional[str]:
    """
    主动向微信支付查询订单状态。
    返回: 'paid' | 'pending' | None（查询失败）
    """
    try:
        wx = _get_wechat_pay()
        code, message = wx.query(out_trade_no=order_id)
        if code == 200 and isinstance(message, dict):
            trade_state = message.get("trade_state", "")
            return "paid" if trade_state == "SUCCESS" else "pending"
        logger.warning(f"微信查单异常 [{code}]: {message}")
        return None
    except Exception as e:
        logger.error(f"微信主动查单失败 order={order_id}: {e}")
        return None


async def query_alipay_order(order_id: str) -> Optional[str]:
    """
    主动向支付宝查询订单状态。
    返回: 'paid' | 'pending' | None（查询失败）
    """
    try:
        alipay = _get_alipay()
        result = alipay.api_alipay_trade_query(out_trade_no=order_id)
        if isinstance(result, dict) and result.get("code") == "10000":
            trade_status = result.get("trade_status", "")
            return "paid" if trade_status == "TRADE_SUCCESS" else "pending"
        logger.warning(f"支付宝查单异常: {result}")
        return None
    except Exception as e:
        logger.error(f"支付宝主动查单失败 order={order_id}: {e}")
        return None
