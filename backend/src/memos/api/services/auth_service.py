"""
认证服务模块
"""

from typing import Optional, Dict, Any
from datetime import datetime, timedelta

from memos.api.core.security import (
    create_access_token, create_refresh_token, verify_token,
    blacklist_token, is_token_blacklisted, PasswordValidator
)
from memos.api.core.redis import get_redis
from memos.api.services.user_service import UserService


class AuthService:
    """认证服务类"""

    def __init__(self):
        self.user_service = UserService()

    async def login(
        self,
        username_or_email: str,
        password: str,
        device_info: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        用户登录

        Args:
            username_or_email: 用户名或邮箱
            password: 密码
            device_info: 设备信息

        Returns:
            登录结果，包含访问令牌、刷新令牌和用户信息
        """
        try:
            # 用户认证
            user = await self.user_service.authenticate_user(username_or_email, password)
            if not user:
                return None

            if user.get("status") != "active":
                return None

            # 创建令牌
            access_token = create_access_token(
                user["id"],
                additional_claims={
                    "username": user["username"],
                    "email": user["email"],
                    "device_info": device_info or {}
                }
            )

            refresh_token = create_refresh_token(user["id"])

            # 存储会话信息到Redis
            await self._create_user_session(user["id"], access_token, device_info)

            return {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "user": user,
                "expires_in": timedelta(minutes=30 * 24 * 60).total_seconds()  # 30天
            }

        except Exception as e:
            print(f"❌ 登录失败: {e}")
            return None

    async def register(
        self,
        username: str,
        email: str,
        password: str,
        confirm_password: str,
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """
        用户注册

        Args:
            username: 用户名
            email: 邮箱
            password: 密码
            confirm_password: 确认密码
            **kwargs: 其他用户信息

        Returns:
            注册结果，包含用户信息和令牌
        """
        try:
            # 验证密码
            if password != confirm_password:
                return None

            # 验证密码强度
            is_valid, error_msg = PasswordValidator.validate_password(password)
            if not is_valid:
                return {"error": error_msg}

            # 检查用户名和邮箱可用性
            if not await self.user_service.check_username_availability(username):
                return {"error": "用户名已被使用"}

            if not await self.user_service.check_email_availability(email):
                return {"error": "邮箱已被使用"}

            # 创建用户
            user = await self.user_service.create_user(username, email, password, **kwargs)
            if not user:
                return None

            # 自动登录
            return await self.login(username, password)

        except Exception as e:
            print(f"❌ 注册失败: {e}")
            return None

    async def refresh_token(self, refresh_token: str) -> Optional[Dict[str, Any]]:
        """
        刷新访问令牌

        Args:
            refresh_token: 刷新令牌

        Returns:
            新的令牌对
        """
        try:
            # 验证刷新令牌
            payload = verify_token(refresh_token, "refresh")
            if not payload:
                return None

            # 检查令牌是否在黑名单中
            if await is_token_blacklisted(refresh_token):
                return None

            user_id = int(payload.get("sub", 0))
            if not user_id:
                return None

            # 获取用户信息
            user = await self.user_service.get_user_by_id(user_id)
            if not user or user.get("status") != "active":
                return None

            # 创建新的访问令牌
            access_token = create_access_token(
                user["id"],
                additional_claims={
                    "username": user["username"],
                    "email": user["email"]
                }
            )

            return {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "user": user,
                "expires_in": timedelta(minutes=30 * 24 * 60).total_seconds()
            }

        except Exception as e:
            print(f"❌ 刷新令牌失败: {e}")
            return None

    async def logout(self, access_token: str, refresh_token: Optional[str] = None) -> bool:
        """
        用户登出

        Args:
            access_token: 访问令牌
            refresh_token: 刷新令牌

        Returns:
            登出是否成功
        """
        try:
            # 验证访问令牌获取用户ID
            payload = verify_token(access_token, "access")
            if not payload:
                return False

            user_id = payload.get("sub")
            if not user_id:
                return False

            # 将访问令牌加入黑名单
            await blacklist_token(access_token)

            # 如果提供了刷新令牌，也加入黑名单
            if refresh_token:
                await blacklist_token(refresh_token)

            # 删除用户会话
            await self._delete_user_session(int(user_id))

            return True

        except Exception as e:
            print(f"❌ 登出失败: {e}")
            return False

    async def validate_token(self, access_token: str) -> Optional[Dict[str, Any]]:
        """
        验证访问令牌

        Args:
            access_token: 访问令牌

        Returns:
            令牌载荷，验证失败返回None
        """
        try:
            # 验证令牌
            payload = verify_token(access_token, "access")
            if not payload:
                return None

            # 检查令牌是否在黑名单中
            if await is_token_blacklisted(access_token):
                return None

            # 检查用户会话
            user_id = int(payload.get("sub", 0))
            if not user_id:
                return None

            redis = await get_redis()
            session_exists = await redis.exists(f"session:{user_id}")
            if not session_exists:
                return None

            return payload

        except Exception as e:
            print(f"❌ 验证令牌失败: {e}")
            return None

    async def get_current_user_from_token(self, access_token: str) -> Optional[Dict[str, Any]]:
        """
        从令牌获取当前用户信息

        Args:
            access_token: 访问令牌

        Returns:
            用户信息，获取失败返回None
        """
        try:
            # 验证令牌
            payload = await self.validate_token(access_token)
            if not payload:
                return None

            # 获取用户信息
            user_id = int(payload.get("sub", 0))
            user = await self.user_service.get_user_by_id(user_id)
            if not user or user.get("status") != "active":
                return None

            return user

        except Exception as e:
            print(f"❌ 获取当前用户信息失败: {e}")
            return None

    async def change_password(
        self,
        user_id: int,
        current_password: str,
        new_password: str,
        confirm_password: str
    ) -> bool:
        """
        修改密码

        Args:
            user_id: 用户ID
            current_password: 当前密码
            new_password: 新密码
            confirm_password: 确认密码

        Returns:
            修改是否成功
        """
        try:
            # 验证新密码
            if new_password != confirm_password:
                return False

            is_valid, error_msg = PasswordValidator.validate_password(new_password)
            if not is_valid:
                print(f"❌ 密码验证失败: {error_msg}")
                return False

            # 获取用户信息进行密码验证
            user = await self.user_service.get_user_by_id(user_id, include_profile=False)
            if not user:
                return False

            # TODO: 这里需要获取用户原始信息来验证密码
            # 由于安全原因，需要从数据库直接验证，而不是从服务层
            # 可以添加一个方法到UserService中专门用于密码验证
            # await self.user_service.verify_password(user_id, current_password)

            # 更新密码
            success = await self.user_service.update_user_password(user_id, new_password)

            if success:
                # 使所有会话失效
                await self._delete_user_session(user_id)

            return success

        except Exception as e:
            print(f"❌ 修改密码失败: {e}")
            return False

    async def _create_user_session(
        self,
        user_id: int,
        access_token: str,
        device_info: Optional[Dict[str, Any]] = None,
        ttl: int = 30 * 24 * 60 * 60  # 30天
    ) -> bool:
        """
        创建用户会话

        Args:
            user_id: 用户ID
            access_token: 访问令牌
            device_info: 设备信息
            ttl: 会话过期时间

        Returns:
            创建是否成功
        """
        try:
            redis = await get_redis()

            session_data = {
                "user_id": user_id,
                "access_token": access_token,
                "device_info": device_info or {},
                "last_activity": datetime.utcnow().isoformat(),
                "created_at": datetime.utcnow().isoformat(),


                "status": "active"
            }

            await redis.set(f"session:{user_id}", session_data, ttl)
            return True

        except Exception as e:
            print(f"❌ 创建用户会话失败: {e}")
            return False

    async def _delete_user_session(self, user_id: int) -> bool:
        """
        删除用户会话

        Args:
            user_id: 用户ID

        Returns:
            删除是否成功
        """
        try:
            redis = await get_redis()
            await redis.delete(f"session:{user_id}")
            return True

        except Exception as e:
            print(f"❌ 删除用户会话失败: {e}")
            return False

    async def update_session_activity(self, user_id: int) -> bool:
        """
        更新用户会话活动时间

        Args:
            user_id: 用户ID

        Returns:
            更新是否成功
        """
        try:
            redis = await get_redis()
            session_key = f"session:{user_id}"

            session_data = await redis.get(session_key)
            if not session_data:
                return False

            session_data["last_activity"] = datetime.utcnow().isoformat()
            await redis.set(session_key, session_data)

            return True

        except Exception as e:
            print(f"❌ 更新会话活动时间失败: {e}")
            return False

    async def get_user_sessions(self, user_id: int) -> Optional[Dict[str, Any]]:
        """
        获取用户会话信息

        Args:
            user_id: 用户ID

        Returns:
            会话信息
        """
        try:
            redis = await get_redis()
            session_data = await redis.get(f"session:{user_id}")
            return session_data

        except Exception as e:
            print(f"❌ 获取用户会话信息失败: {e}")
            return None