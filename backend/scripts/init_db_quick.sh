#!/bin/bash
# 快速初始化数据库脚本

cd "$(dirname "$0")"

echo "正在初始化数据库..."
echo ""

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到 python3"
    exit 1
fi

# 尝试使用uvicorn运行时的环境
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

# 运行初始化脚本
python3 -c "
import asyncio
import sys
from pathlib import Path

backend_dir = Path('.')
src_dir = backend_dir / 'src'
sys.path.insert(0, str(src_dir))

async def init():
    try:
        from memos.api.core.database import init_db, close_db
        print('正在创建数据库表...')
        await init_db()
        print('✅ 数据库表创建成功')
    except Exception as e:
        print(f'❌ 错误: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        await close_db()

asyncio.run(init())
"

echo ""
echo "初始化完成！"
