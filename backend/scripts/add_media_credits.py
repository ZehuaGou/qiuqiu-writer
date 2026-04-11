#!/usr/bin/env python3
"""
媒体 Credits 迁移脚本
1. users 表新增 image_credits / video_credits 列
2. 新建 media_credit_orders 表
"""

import asyncio
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "src"))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from memos.api.core.config import get_settings

settings = get_settings()
engine = create_async_engine(settings.DATABASE_URL, echo=False)


async def run():
    async with engine.begin() as conn:

        # ── 1. users 表加列 ──────────────────────────────────────────────────
        for col, default in [("image_credits", 0), ("video_credits", 0)]:
            result = await conn.execute(text(f"""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = '{col}';
            """))
            if result.fetchone():
                print(f"✅ users.{col} 已存在，跳过")
            else:
                await conn.execute(text(f"""
                    ALTER TABLE users
                    ADD COLUMN {col} INTEGER NOT NULL DEFAULT {default};
                """))
                print(f"✅ users.{col} 添加成功")

        # ── 2. 新建 media_credit_orders 表 ───────────────────────────────────
        result = await conn.execute(text("""
            SELECT table_name FROM information_schema.tables
            WHERE table_name = 'media_credit_orders';
        """))
        if result.fetchone():
            print("✅ media_credit_orders 表已存在，跳过")
        else:
            await conn.execute(text("""
                CREATE TABLE media_credit_orders (
                    id          VARCHAR(40) PRIMARY KEY,
                    user_id     VARCHAR(40) NOT NULL,
                    order_type  VARCHAR(10) NOT NULL,
                    pack_key    VARCHAR(50) NOT NULL,
                    pack_label  VARCHAR(100) NOT NULL,
                    credits     INTEGER NOT NULL,
                    method      VARCHAR(20) NOT NULL,
                    amount      DOUBLE PRECISION NOT NULL,
                    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
                    qr_url      TEXT,
                    notify_data JSON,
                    created_at  TIMESTAMPTZ DEFAULT NOW(),
                    paid_at     TIMESTAMPTZ
                );
            """))
            await conn.execute(text(
                "CREATE INDEX idx_media_credit_orders_user_id ON media_credit_orders(user_id);"
            ))
            await conn.execute(text(
                "CREATE INDEX idx_media_credit_orders_created_at ON media_credit_orders(created_at);"
            ))
            print("✅ media_credit_orders 表创建成功")

    print("\n✅ 迁移完成")


if __name__ == "__main__":
    print("=" * 50)
    print("媒体 Credits 数据库迁移")
    print("=" * 50)
    try:
        asyncio.run(run())
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        asyncio.run(engine.dispose())
