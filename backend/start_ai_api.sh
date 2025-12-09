#!/bin/bash

# AI接口快速启动脚本

set -e

echo "=========================================="
echo "启动AI接口服务"
echo "=========================================="

# 检查环境变量
if [ -z "$OPENAI_API_KEY" ]; then
    echo "警告: OPENAI_API_KEY 环境变量未设置"
    echo "请设置API密钥后再启动服务："
    echo "  export OPENAI_API_KEY=your_api_key_here"
    echo ""
    echo "或者创建 .env 文件（参考 ai_config.example）"
    echo ""
    read -p "是否继续启动（服务可能无法正常工作）？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 设置默认端口
PORT=${PORT:-8001}
HOST=${HOST:-0.0.0.0}

echo "配置信息："
echo "  - 主机: $HOST"
echo "  - 端口: $PORT"
echo "  - API基础URL: http://$HOST:$PORT/api/ai"
echo ""

# 检查Python环境
if command -v poetry &> /dev/null; then
    echo "使用 Poetry 启动服务..."
    poetry run python -m memos.api.product_api --port $PORT
elif [ -d "venv" ]; then
    echo "使用 venv 启动服务..."
    source venv/bin/activate
    python -m memos.api.product_api --port $PORT
else
    echo "使用系统 Python 启动服务..."
    python -m memos.api.product_api --port $PORT
fi

