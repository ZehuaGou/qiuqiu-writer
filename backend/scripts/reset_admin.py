
import asyncio
import sys
import os
from pathlib import Path

# Add src to python path
script_dir = Path(__file__).parent
backend_dir = script_dir.parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

# 避免导入整个memos包，直接导入需要的模块
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import bcrypt

# 数据库连接信息
DATABASE_URL = "postgresql+asyncpg://postgres:password@postgres:5432/writerai"

# 简化的AdminUser模型
class AdminUser:
    __tablename__ = "admin_users"
    
    def __init__(self, id=None, username=None, password_hash=None):
        self.id = id
        self.username = username
        self.password_hash = password_hash

def get_password_hash(password):
    """生成密码哈希"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

async def get_async_session():
    """创建异步会话"""
    engine = create_async_engine(DATABASE_URL)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with AsyncSessionLocal() as session:
        yield session
    await engine.dispose()

async def reset_admin():
    # 创建异步引擎
    engine = create_async_engine(DATABASE_URL)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with AsyncSessionLocal() as session:
        try:
            # 直接使用原始SQL查询
            result = await session.execute(
                text("SELECT id, username, password_hash FROM admin_users WHERE username = :username"),
                {"username": "admin"}
            )
            admin_data = result.fetchone()
            
            if admin_data:
                # 更新密码
                await session.execute(
                    text("UPDATE admin_users SET password_hash = :password_hash WHERE username = :username"),
                    {
                        "password_hash": get_password_hash("admin123456"),
                        "username": "admin"
                    }
                )
                await session.commit()
                print("✅ Admin password reset to 'admin123456'")
            else:
                print("❌ Admin user not found")
        except Exception as e:
            print(f"❌ Error: {e}")
            await session.rollback()
        finally:
            await engine.dispose()

if __name__ == "__main__":
    asyncio.run(reset_admin())
