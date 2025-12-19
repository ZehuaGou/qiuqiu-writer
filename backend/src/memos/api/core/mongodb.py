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
            # 构建连接 URL（隐藏密码用于日志）
            log_url = settings.MONGODB_URL
            if settings.MONGODB_USERNAME and settings.MONGODB_PASSWORD:
                # 在日志中隐藏密码
                log_url = log_url.replace(settings.MONGODB_PASSWORD, "***")
            
            _mongodb_client = AsyncIOMotorClient(
                settings.MONGODB_URL,
                serverSelectionTimeoutMS=5000,
            )
            # 测试连接
            await _mongodb_client.admin.command('ping')
            logger.info(f"MongoDB连接成功: {log_url}")
        except Exception as e:
            error_str = str(e)
            # 如果认证失败，可能是 MongoDB 没有启用访问控制
            # 尝试使用无认证连接
            if "Authentication failed" in error_str or "AuthenticationFailed" in error_str:
                logger.warning(f"MongoDB认证失败，尝试无认证连接: {error_str}")
                try:
                    # 构建无认证的连接 URL
                    no_auth_url = f"mongodb://{settings.MONGODB_HOST}:{settings.MONGODB_PORT}/{settings.MONGODB_DATABASE}"
                    _mongodb_client = AsyncIOMotorClient(
                        no_auth_url,
                        serverSelectionTimeoutMS=5000,
                    )
                    # 测试连接
                    await _mongodb_client.admin.command('ping')
                    logger.info(f"MongoDB连接成功（无认证模式）: {no_auth_url}")
                    logger.warning(
                        "MongoDB 未启用访问控制，使用无认证连接。"
                        "建议在生产环境中启用 MongoDB 访问控制以提高安全性。"
                    )
                except Exception as retry_err:
                    logger.error(f"MongoDB无认证连接也失败: {retry_err}")
                    logger.error(
                        "MongoDB连接失败，请检查：\n"
                        "1. MongoDB 服务是否正在运行\n"
                        "2. 连接地址和端口是否正确\n"
                        "3. 如果启用了访问控制，请确认用户名和密码正确\n"
                        "4. 用户是否在 admin 数据库中有权限\n"
                        "5. 密码中是否包含特殊字符（已自动进行URL编码）"
                    )
                    raise
            else:
                logger.error(f"MongoDB连接失败: {error_str}")
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

