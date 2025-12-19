"""
MongoDB连接管理模块
"""

from typing import Optional

try:
    from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
    MOTOR_AVAILABLE = True
except ImportError:
    MOTOR_AVAILABLE = False
    AsyncIOMotorClient = None
    AsyncIOMotorDatabase = None

from memos.api.core.config import get_settings
from memos.log import get_logger

logger = get_logger(__name__)

# 全局MongoDB客户端
_mongodb_client: Optional[AsyncIOMotorClient] = None
_mongodb_db: Optional[AsyncIOMotorDatabase] = None


async def get_mongodb_client() -> AsyncIOMotorClient:
    """获取MongoDB客户端（单例模式）"""
    global _mongodb_client
    
    if not MOTOR_AVAILABLE:
        raise ImportError(
            "motor包未安装。请安装: pip install motor"
        )
    
    if _mongodb_client is None:
        settings = get_settings()
        try:
            _mongodb_client = AsyncIOMotorClient(
                settings.MONGODB_URL,
                serverSelectionTimeoutMS=5000,
            )
            # 测试连接
            await _mongodb_client.admin.command('ping')
            logger.info(f"MongoDB连接成功: {settings.MONGODB_URL}")
        except Exception as e:
            logger.error(f"MongoDB连接失败: {e}")
            raise
    
    return _mongodb_client


async def get_mongodb_db() -> AsyncIOMotorDatabase:
    """获取MongoDB数据库实例"""
    global _mongodb_db
    
    if _mongodb_db is None:
        settings = get_settings()
        client = await get_mongodb_client()
        _mongodb_db = client[settings.MONGODB_DATABASE]
    
    return _mongodb_db


async def close_mongodb():
    """关闭MongoDB连接"""
    global _mongodb_client, _mongodb_db
    
    if _mongodb_client:
        _mongodb_client.close()
        _mongodb_client = None
        _mongodb_db = None
        logger.info("MongoDB连接已关闭")

