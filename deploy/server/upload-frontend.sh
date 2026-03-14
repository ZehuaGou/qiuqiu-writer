#!/usr/bin/env bash
# =============================================================================
# upload-frontend.sh — 本地打包并上传到服务器（在本机执行）
#
# 用法：
#   bash deploy/server/upload-frontend.sh
#
# 首次使用前修改下方 SERVER_* 变量。
# =============================================================================
set -euo pipefail

# ===================== 按需修改 =====================
SERVER_USER="root"
SERVER_HOST=""          # 服务器 IP，例：123.45.67.89
SERVER_PORT="22"        # SSH 端口，阿里云默认 22
SSH_KEY=""              # 私钥路径，留空则用默认 ~/.ssh/id_rsa，例：~/.ssh/aliyun_key
# ====================================================

if [ -z "$SERVER_HOST" ]; then
    echo "错误：请先在脚本顶部填写 SERVER_HOST（服务器 IP）" >&2
    exit 1
fi

# 构建 SSH/rsync 选项
SSH_OPTS="-p $SERVER_PORT -o StrictHostKeyChecking=no"
if [ -n "$SSH_KEY" ]; then
    SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi

# 项目根目录（脚本所在 deploy/server/ 的上两级）
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# 服务器上 nginx 静态文件目录
REMOTE_FRONTEND="/var/www/xingqiu_writer/frontend/"
REMOTE_ADMIN="/var/www/xingqiu_writer/admin/"

echo "=== 项目根目录：$PROJECT_ROOT ==="
echo "=== 目标服务器：$SERVER_USER@$SERVER_HOST:$SERVER_PORT ==="

# ---------- 打包前端 ----------
echo ""
echo "=== [1/4] 打包前端 (frontend) ==="
cd "$PROJECT_ROOT/frontend"
npm run build
echo "  打包完成：$PROJECT_ROOT/frontend/dist/"

# ---------- 打包管理后台 ----------
echo ""
echo "=== [2/4] 打包管理后台 (admin) ==="
cd "$PROJECT_ROOT/admin"
npm run build
echo "  打包完成：$PROJECT_ROOT/admin/dist/"

# ---------- 上传前端 ----------
echo ""
echo "=== [3/4] 上传前端到服务器 $REMOTE_FRONTEND ==="
rsync -avz --delete \
    -e "ssh $SSH_OPTS" \
    "$PROJECT_ROOT/frontend/dist/" \
    "$SERVER_USER@$SERVER_HOST:$REMOTE_FRONTEND"

# ---------- 上传管理后台 ----------
echo ""
echo "=== [4/4] 上传管理后台到服务器 $REMOTE_ADMIN ==="
rsync -avz --delete \
    -e "ssh $SSH_OPTS" \
    "$PROJECT_ROOT/admin/dist/" \
    "$SERVER_USER@$SERVER_HOST:$REMOTE_ADMIN"

echo ""
echo "==========================================="
echo " 前端上传完成！"
echo " 前端：    http://$SERVER_HOST"
echo " 管理后台：http://$SERVER_HOST:8889"
echo "==========================================="
