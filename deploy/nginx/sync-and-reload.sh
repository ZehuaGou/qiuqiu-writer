#!/bin/bash
# 把项目里的 wawawriter.conf 同步到 Nginx 并尝试重载/启动
# 运行后访问 http://localhost:8888

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Intel Mac 改为: /usr/local/etc/nginx/servers
NGINX_SERVERS="/opt/homebrew/etc/nginx/servers"
NGINX_BIN="/opt/homebrew/bin/nginx"
# 用项目内最小配置，只监听 8888，避免系统 nginx.conf 里默认 8080/8000 冲突
MINIMAL_CONF="$SCRIPT_DIR/nginx-minimal.conf"

cp "$SCRIPT_DIR/wawawriter.conf" "$NGINX_SERVERS/wawawriter.conf"
echo "已复制 wawawriter.conf 到 $NGINX_SERVERS"

"$NGINX_BIN" -t -c "$MINIMAL_CONF"
if "$NGINX_BIN" -s reload -c "$MINIMAL_CONF" 2>/dev/null; then
  echo "Nginx 已重载，请访问 http://localhost:8888"
else
  echo "正在用最小配置启动 Nginx（仅 8888）..."
  "$NGINX_BIN" -c "$MINIMAL_CONF" && echo "已启动，请访问 http://localhost:8888" || {
    echo "若报 8000/8080 被占用，说明系统 nginx 与其它进程冲突，用上面命令已可单独起一份仅 8888 的 nginx。"
  }
fi
