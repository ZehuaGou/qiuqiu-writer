"""
多人协作 AI WebSocket 路由

端点：WS /api/v1/collab-ai/{work_id}?token=<JWT>

认证：通过 ?token= query 参数传递 JWT access token（与 Yjs WS 端点保持一致的模式）。
"""

import logging
from typing import Optional

from fastapi import APIRouter, WebSocket

from memos.api.core.security import verify_token
from memos.api.services.collab_ai_manager import collab_ai_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/collab-ai", tags=["collab-ai"])


@router.websocket("/{work_id}")
async def collab_ai_websocket(
    websocket: WebSocket,
    work_id: str,
    token: Optional[str] = None,
):
    """
    多人协作 AI WebSocket 端点。

    - room = work_{work_id}（与 Yjs 相同的 work 粒度）
    - 认证：?token=<JWT access token>
    - 消息格式：JSON 文本帧（非二进制）
    """
    await websocket.accept()

    # ── 认证 ──────────────────────────────────────────────────────────────────
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return

    payload = verify_token(token, token_type="access")
    if not payload:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    user_id_raw = str(payload.get("sub", ""))
    if not user_id_raw:
        await websocket.close(code=1008, reason="Invalid token payload")
        return

    # ── 规范化用户 ID & 获取用户名 ────────────────────────────────────────────
    user_id = user_id_raw
    user_name = user_id_raw
    try:
        from memos.api.core.id_utils import normalize_legacy_id
        user_id = normalize_legacy_id(user_id_raw) or user_id_raw

        from memos.api.services.user_service import UserService
        us = UserService()
        user = await us.get_user_by_id(user_id)
        if user:
            user_name = (
                user.get("display_name")
                or user.get("username")
                or user_id
            )
    except Exception as e:
        logger.warning(f"[CollabAIRouter] Failed to get user info for {user_id}: {e}")

    logger.info(f"[CollabAIRouter] WS connected: work={work_id}, user={user_name}({user_id})")

    # ── 进入房间（完整连接生命周期） ──────────────────────────────────────────
    await collab_ai_manager.handle_connection(websocket, work_id, user_id, user_name)
