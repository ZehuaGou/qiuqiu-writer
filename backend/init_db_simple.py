#!/usr/bin/env python3
"""
简单的数据库初始化脚本
直接使用SQLAlchemy创建所有表
"""

import asyncio
import sys
from pathlib import Path

# 添加 src 目录到 Python 路径
backend_dir = Path(__file__).parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

async def main():
    """初始化数据库表"""
    try:
        from memos.api.core.database import init_db, engine, close_db
        from memos.api.core.config import get_settings
        
        settings = get_settings()
        
        print("=" * 60)
        print("数据库初始化")
        print("=" * 60)
        print(f"数据库: {settings.POSTGRES_DB}")
        print(f"主机: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}")
        print(f"用户: {settings.POSTGRES_USER}")
        print("")
        
        # 初始化数据库表
        print("正在创建数据库表...")
        await init_db()
        print("✅ 数据库表创建成功")
        print("")
        print("=" * 60)
        print("初始化完成！")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        try:
            await close_db()
        except:
            pass

if __name__ == "__main__":
    asyncio.run(main())

"""
简单的数据库初始化脚本
直接使用SQLAlchemy创建所有表
"""

import asyncio
import sys
from pathlib import Path

# 添加 src 目录到 Python 路径
backend_dir = Path(__file__).parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

async def main():
    """初始化数据库表"""
    try:
        from memos.api.core.database import init_db, engine, close_db
        from memos.api.core.config import get_settings
        
        settings = get_settings()
        
        print("=" * 60)
        print("数据库初始化")
        print("=" * 60)
        print(f"数据库: {settings.POSTGRES_DB}")
        print(f"主机: {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}")
        print(f"用户: {settings.POSTGRES_USER}")
        print("")
        
        # 初始化数据库表
        print("正在创建数据库表...")
        await init_db()
        print("✅ 数据库表创建成功")
        print("")
        print("=" * 60)
        print("初始化完成！")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        try:
            await close_db()
        except:
            pass

if __name__ == "__main__":
    asyncio.run(main())

