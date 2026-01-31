"""
40 位字符串 ID 生成工具
用于 work_id、user_id 等主键及外键
"""

import secrets

ID_LENGTH = 40


def generate_id() -> str:
    """
    生成 40 位 URL 安全随机字符串（base64url 编码）。
    用于 user_id、work_id 等。
    """
    # token_urlsafe(30) 编码后长度为 40
    return secrets.token_urlsafe(30)


def normalize_legacy_id(value: str | None) -> str | None:
    """
    将迁移前的整数 ID（JWT/请求中可能仍为 "1"）规范为 40 位零填充字符串，
    与迁移脚本中的 LPAD(id::text, 40, '0') 一致，便于查库和外键匹配。
    """
    if value is None or value == "":
        return value
    s = str(value).strip()
    if not s or len(s) > ID_LENGTH:
        return s
    if s.isdigit():
        return s.zfill(ID_LENGTH)
    return s
