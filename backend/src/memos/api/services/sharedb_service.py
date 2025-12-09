"""
ShareDB服务 - 处理实时协作编辑
"""

import asyncio
import json
import uuid
from typing import Dict, Any, List, Optional, Set
from datetime import datetime
import logging
from fastapi import WebSocket
import redis.asyncio as redis

from memos.api.core.config import get_settings
from memos.api.core.redis import get_redis

settings = get_settings()
logger = logging.getLogger(__name__)


class ShareDBService:
    """ShareDB服务类，模拟ShareDB功能用于实时协作"""

    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.document_locks: Dict[str, asyncio.Lock] = {}
        self._initialized = False

    async def initialize(self):
        """初始化服务"""
        if self._initialized:
            return

        try:
            self.redis_client = await get_redis()
            self._initialized = True
            logger.info("ShareDB服务初始化成功")
        except Exception as e:
            logger.error(f"ShareDB服务初始化失败: {e}")
            raise

    async def create_document(self, document_id: str, initial_content: Dict[str, Any]):
        """创建新文档"""
        if not self._initialized:
            await self.initialize()

        document = {
            "id": document_id,
            "content": initial_content.get("content", ""),
            "title": initial_content.get("title", ""),
            "metadata": initial_content.get("metadata", {}),
            "operations": [],
            "version": 0,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        # 存储到Redis
        await self.redis_client.setex(
            f"doc:{document_id}",
            settings.SHAREDB_DOCUMENT_TTL or 86400,  # 24小时默认TTL
            json.dumps(document)
        )

        logger.info(f"创建ShareDB文档: {document_id}")
        return document

    async def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        """获取文档内容"""
        if not self._initialized:
            await self.initialize()

        try:
            document_data = await self.redis_client.get(f"doc:{document_id}")
            if document_data:
                return json.loads(document_data)
        except Exception as e:
            logger.error(f"获取文档失败 {document_id}: {e}")

        return None

    async def update_document(self, document_id: str, update_data: Dict[str, Any]):
        """更新文档"""
        if not self._initialized:
            await self.initialize()

        document = await self.get_document(document_id)
        if not document:
            raise ValueError(f"文档不存在: {document_id}")

        # 获取锁以保证原子操作
        if document_id not in self.document_locks:
            self.document_locks[document_id] = asyncio.Lock()

        async with self.document_locks[document_id]:
            # 更新文档
            for key, value in update_data.items():
                if "." in key:
                    # 支持嵌套路径更新，如 "metadata.updated_by"
                    self._set_nested_value(document, key, value)
                else:
                    document[key] = value

            document["version"] += 1
            document["updated_at"] = datetime.utcnow().isoformat()

            # 保存到Redis
            await self.redis_client.setex(
                f"doc:{document_id}",
                settings.SHAREDB_DOCUMENT_TTL or 86400,
                json.dumps(document)
            )

            # 广播更新给所有连接的客户端
            await self._broadcast_update(document_id, {
                "type": "document_updated",
                "document_id": document_id,
                "version": document["version"],
                "updated_data": update_data
            })

            logger.info(f"更新ShareDB文档: {document_id}")
            return document

    async def delete_document(self, document_id: str):
        """删除文档"""
        if not self._initialized:
            await self.initialize()

        # 删除Redis中的文档
        await self.redis_client.delete(f"doc:{document_id}")

        # 断开所有连接
        if document_id in self.active_connections:
            for websocket in self.active_connections[document_id].copy():
                try:
                    await websocket.close(code=1001, reason="文档已删除")
                except:
                    pass
            del self.active_connections[document_id]

        logger.info(f"删除ShareDB文档: {document_id}")

    async def submit_operation(self, document_id: str, operation: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """提交操作到文档"""
        if not self._initialized:
            await self.initialize()

        document = await self.get_document(document_id)
        if not document:
            raise ValueError(f"文档不存在: {document_id}")

        # 获取锁
        if document_id not in self.document_locks:
            self.document_locks[document_id] = asyncio.Lock()

        async with self.document_locks[document_id]:
            # 应用操作
            op_result = await self._apply_operation(document, operation, user_id)

            # 更新文档
            document["version"] += 1
            document["updated_at"] = datetime.utcnow().isoformat()

            operation_id = str(uuid.uuid4())
            operation_record = {
                "id": operation_id,
                "operation": operation,
                "user_id": user_id,
                "timestamp": datetime.utcnow().isoformat(),
                "version": document["version"]
            }
            document["operations"].append(operation_record)

            # 保存到Redis
            await self.redis_client.setex(
                f"doc:{document_id}",
                settings.SHAREDB_DOCUMENT_TTL or 86400,
                json.dumps(document)
            )

            # 广播操作给其他用户
            await self._broadcast_operation(document_id, {
                "type": "operation_applied",
                "operation": operation,
                "operation_id": operation_id,
                "user_id": user_id,
                "version": document["version"]
            }, exclude_user_id=user_id)

            return op_result

    async def join_collaboration(self, websocket: WebSocket, document_id: str, user_id: int):
        """加入协作会话"""
        if not self._initialized:
            await self.initialize()

        # 加入活跃连接
        if document_id not in self.active_connections:
            self.active_connections[document_id] = set()

        self.active_connections[document_id].add(websocket)

        # 获取当前文档状态
        document = await self.get_document(document_id)
        if document:
            # 发送当前文档状态给新用户
            await websocket.send_text(json.dumps({
                "type": "document_state",
                "document_id": document_id,
                "document": document,
                "current_users": len(self.active_connections[document_id]) - 1
            }))

        # 广播用户加入消息
        await self._broadcast_user_event(document_id, {
            "type": "user_joined",
            "user_id": user_id,
            "timestamp": datetime.utcnow().isoformat(),
            "current_users": len(self.active_connections[document_id])
        }, exclude_websocket=websocket)

        logger.info(f"用户 {user_id} 加入文档协作: {document_id}")

        try:
            # 保持连接并处理消息
            while True:
                try:
                    message = await websocket.receive_text()
                    data = json.loads(message)

                    # 处理不同类型的消息
                    if data.get("type") == "operation":
                        await self.submit_operation(document_id, data["operation"], user_id)
                    elif data.get("type") == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))

                except json.JSONDecodeError:
                    logger.warning(f"无效的JSON消息: {message}")
                except Exception as e:
                    logger.error(f"处理WebSocket消息错误: {e}")
                    break

        except Exception as e:
            logger.error(f"WebSocket连接错误: {e}")
        finally:
            # 清理连接
            await self._cleanup_connection(websocket, document_id, user_id)

    async def get_document_users(self, document_id: str) -> List[Dict[str, Any]]:
        """获取文档当前用户列表"""
        if document_id not in self.active_connections:
            return []

        # 这里应该从连接中获取用户信息，简化处理
        return [
            {"user_id": i, "joined_at": datetime.utcnow().isoformat()}
            for i in range(len(self.active_connections[document_id]))
        ]

    async def _apply_operation(self, document: Dict[str, Any], operation: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """应用操作到文档"""
        op_type = operation.get("type")
        path = operation.get("path", [])
        value = operation.get("value")

        result = {"success": True, "applied": True}

        try:
            if op_type == "insert_text":
                # 文本插入操作
                content = document.get("content", "")
                position = operation.get("position", 0)
                text = operation.get("text", "")

                if position >= len(content):
                    document["content"] = content + text
                else:
                    document["content"] = content[:position] + text + content[position:]

                result["new_content_length"] = len(document["content"])

            elif op_type == "delete_text":
                # 文本删除操作
                content = document.get("content", "")
                position = operation.get("position", 0)
                length = operation.get("length", 0)

                if position < len(content):
                    end_pos = min(position + length, len(content))
                    document["content"] = content[:position] + content[end_pos:]

                result["new_content_length"] = len(document["content"])

            elif op_type == "replace_text":
                # 文本替换操作
                content = document.get("content", "")
                position = operation.get("position", 0)
                length = operation.get("length", 0)
                text = operation.get("text", "")

                if position < len(content):
                    end_pos = min(position + length, len(content))
                    document["content"] = content[:position] + text + content[end_pos:]

                result["new_content_length"] = len(document["content"])

            elif op_type == "set_attribute":
                # 设置属性操作
                attribute = operation.get("attribute")
                self._set_nested_value(document, attribute, value)
                result["attribute"] = attribute
                result["value"] = value

            else:
                result["success"] = False
                result["error"] = f"不支持的操作类型: {op_type}"

        except Exception as e:
            result["success"] = False
            result["error"] = str(e)
            logger.error(f"应用操作失败: {e}")

        return result

    async def _broadcast_update(self, document_id: str, message: Dict[str, Any]):
        """广播文档更新给所有连接的客户端"""
        if document_id not in self.active_connections:
            return

        message_text = json.dumps(message)
        disconnected = set()

        for websocket in self.active_connections[document_id]:
            try:
                await websocket.send_text(message_text)
            except Exception:
                disconnected.add(websocket)

        # 清理断开的连接
        for websocket in disconnected:
            self.active_connections[document_id].discard(websocket)

    async def _broadcast_operation(self, document_id: str, message: Dict[str, Any], exclude_user_id: Optional[int] = None):
        """广播操作给其他用户"""
        await self._broadcast_update(document_id, message)

    async def _broadcast_user_event(self, document_id: str, message: Dict[str, Any], exclude_websocket: Optional[WebSocket] = None):
        """广播用户事件"""
        message_text = json.dumps(message)

        if document_id not in self.active_connections:
            return

        for websocket in self.active_connections[document_id]:
            if websocket != exclude_websocket:
                try:
                    await websocket.send_text(message_text)
                except Exception:
                    pass

    async def _cleanup_connection(self, websocket: WebSocket, document_id: str, user_id: int):
        """清理连接资源"""
        # 从活跃连接中移除
        if document_id in self.active_connections:
            self.active_connections[document_id].discard(websocket)

            # 如果没有用户连接了，清空集合
            if not self.active_connections[document_id]:
                del self.active_connections[document_id]
            else:
                # 广播用户离开消息
                await self._broadcast_user_event(document_id, {
                    "type": "user_left",
                    "user_id": user_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "current_users": len(self.active_connections[document_id])
                })

        logger.info(f"用户 {user_id} 离开文档协作: {document_id}")

    def _set_nested_value(self, obj: Dict[str, Any], path: str, value: Any):
        """设置嵌套字典值"""
        keys = path.split(".")
        current = obj

        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]

        current[keys[-1]] = value


# 全局ShareDB服务实例
sharedb_service = ShareDBService()