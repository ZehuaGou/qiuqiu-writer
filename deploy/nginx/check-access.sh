#!/bin/bash
# 排查「访问不到」：检查 nginx、端口、前端 dist、配置是否一致

set -e
echo "========== 1. 本机 80 端口是否在监听 =========="
lsof -i :80 || echo "无进程监听 80，请执行: sudo nginx"

echo ""
echo "========== 2. 前端打包目录是否存在 =========="
ROOT="/Users/pang/Documents/wawawriter/frontend/dist"
if [ -f "$ROOT/index.html" ]; then
  echo "OK: $ROOT/index.html 存在"
else
  echo "缺失: 请先执行 cd frontend && npm run build"
fi

echo ""
echo "========== 3. 当前加载的 wawawriter 配置（listen / root） =========="
grep -E "listen|root" /opt/homebrew/etc/nginx/servers/wawawriter.conf 2>/dev/null || true

echo ""
echo "========== 4. 用 curl 测本机 80 =========="
curl -sI -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:80/ || echo "curl 失败，80 可能未监听或拒绝连接"

echo ""
echo "========== 5. 后端 8001 是否在运行（API 用） =========="
curl -sI -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:8001/docs 2>/dev/null || echo "8001 未响应，请先启动后端"
