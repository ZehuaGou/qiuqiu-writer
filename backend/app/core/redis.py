"""
Redis客户端和缓存管理模块
"""

import json
from typing import Any, Optional, List

import redis.asyncio as redis
from redis.asyncio import Redis

from app.core.config import get_settings

settings = get_settings()


class RedisClient:
    """Redis客户端封装类"""

    def __init__(self):
        self.redis: Optional[Redis] = None

    async def connect(self):
        """连接Redis"""
        self.redis = Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=True,
        )
        # 测试连接
        await self.redis.ping()
        print("✅ Redis连接成功")

    async def disconnect(self):
        """断开Redis连接"""
        if self.redis:
            await self.redis.close()
            print("✅ Redis连接已断开")

    async def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        if not self.redis:
            return None

        try:
            value = await self.redis.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            print(f"❌ Redis GET 错误: {e}")
            return None

    async def set(self, key: str, value: Any, ttl: int = settings.CACHE_TTL) -> bool:
        """设置缓存值"""
        if not self.redis:
            return False

        try:
            await self.redis.setex(key, ttl, json.dumps(value, ensure_ascii=False))
            return True
        except Exception as e:
            print(f"❌ Redis SET 错误: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """删除缓存值"""
        if not self.redis:
            return False

        try:
            await self.redis.delete(key)
            return True
        except Exception as e:
            print(f"❌ Redis DELETE 错误: {e}")
            return False

    async def exists(self, key: str) -> bool:
        """检查键是否存在"""
        if not self.redis:
            return False

        try:
            return bool(await self.redis.exists(key))
        except Exception as e:
            print(f"❌ Redis EXISTS 错误: {e}")
            return False

    async def expire(self, key: str, ttl: int) -> bool:
        """设置键的过期时间"""
        if not self.redis:
            return False

        try:
            await self.redis.expire(key, ttl)
            return True
        except Exception as e:
            print(f"❌ Redis EXPIRE 错误: {e}")
            return False

    async def incr(self, key: str, amount: int = 1) -> int:
        """递增计数器"""
        if not self.redis:
            return 0

        try:
            return await self.redis.incrby(key, amount)
        except Exception as e:
            print(f"❌ Redis INCR 错误: {e}")
            return 0

    async def decr(self, key: str, amount: int = 1) -> int:
        """递减计数器"""
        if not self.redis:
            return 0

        try:
            return await self.redis.decrby(key, amount)
        except Exception as e:
            print(f"❌ Redis DECR 错误: {e}")
            return 0

    async def lpush(self, key: str, value: Any) -> int:
        """左推入列表"""
        if not self.redis:
            return 0

        try:
            return await self.redis.lpush(key, json.dumps(value, ensure_ascii=False))
        except Exception as e:
            print(f"❌ Redis LPUSH 错误: {e}")
            return 0

    async def rpop(self, key: str) -> Optional[Any]:
        """右弹出列表"""
        if not self.redis:
            return None

        try:
            value = await self.redis.rpop(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            print(f"❌ Redis RPOP 错误: {e}")
            return None

    async def lrange(self, key: str, start: int = 0, end: int = -1) -> List[Any]:
        """获取列表范围"""
        if not self.redis:
            return []

        try:
            values = await self.redis.lrange(key, start, end)
            return [json.loads(value) for value in values]
        except Exception as e:
            print(f"❌ Redis LRANGE 错误: {e}")
            return []

    async def sadd(self, key: str, members: List[Any]) -> int:
        """添加到集合"""
        if not self.redis:
            return 0

        try:
            serialized_members = [json.dumps(member, ensure_ascii=False) for member in members]
            return await self.redis.sadd(key, *serialized_members)
        except Exception as e:
            print(f"❌ Redis SADD 错误: {e}")
            return 0

    async def srem(self, key: str, members: List[Any]) -> int:
        """从集合删除"""
        if not self.redis:
            return 0

        try:
            serialized_members = [json.dumps(member, ensure_ascii=False) for member in members]
            return await self.redis.srem(key, *serialized_members)
        except Exception as e:
            print(f"❌ Redis SREM 错误: {e}")
            return 0

    async def smembers(self, key: str) -> set:
        """获取集合所有成员"""
        if not self.redis:
            return set()

        try:
            members = await self.redis.smembers(key)
            return {json.loads(member) for member in members}
        except Exception as e:
            print(f"❌ Redis SMEMBERS 错误: {e}")
            return set()

    async def hget(self, key: str, field: str) -> Optional[Any]:
        """获取哈希字段值"""
        if not self.redis:
            return None

        try:
            value = await self.redis.hget(key, field)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            print(f"❌ Redis HGET 错误: {e}")
            return None

    async def hset(self, key: str, field: str, value: Any) -> bool:
        """设置哈希字段值"""
        if not self.redis:
            return False

        try:
            await self.redis.hset(key, field, json.dumps(value, ensure_ascii=False))
            return True
        except Exception as e:
            print(f"❌ Redis HSET 错误: {e}")
            return False

    async def hdel(self, key: str, field: str) -> bool:
        """删除哈希字段"""
        if not self.redis:
            return False

        try:
            await self.redis.hdel(key, field)
            return True
        except Exception as e:
            print(f"❌ Redis HDEL 错误: {e}")
            return False

    async def hgetall(self, key: str) -> dict:
        """获取哈希所有字段"""
        if not self.redis:
            return {}

        try:
            result = await self.redis.hgetall(key)
            return {k: json.loads(v) for k, v in result.items()}
        except Exception as e:
            print(f"❌ Redis HGETALL 错误: {e}")
            return {}


# 全局Redis客户端实例
redis_client = RedisClient()


async def get_redis() -> RedisClient:
    """获取Redis客户端实例"""
    return redis_client


# 缓存装饰器
def cache_key(prefix: str, *args, **kwargs):
    """生成缓存键"""
    import hashlib

    key_data = f"{prefix}:{args}:{sorted(kwargs.items())}"
    return hashlib.md5(key_data.encode()).hexdigest()


def cached(prefix: str, ttl: int = settings.CACHE_TTL):
    """缓存装饰器"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # 生成缓存键
            cache_key = f"{prefix}:{hash(str(args) + str(sorted(kwargs.items())))}"

            # 尝试从缓存获取
            cached_result = await redis_client.get(cache_key)
            if cached_result is not None:
                return cached_result

            # 执行函数并缓存结果
            result = await func(*args, **kwargs)
            await redis_client.set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator