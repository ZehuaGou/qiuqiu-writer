#!/usr/bin/env bash
# =============================================================================
# deploy.sh — 服务器端部署 / 更新脚本（仅更新本地宿主机 nginx 配置）
# =============================================================================
set -euo pipefail

# ---------- 可调整参数 ----------
PROJECT_DIR="/root/xingqiu_writer"   # 服务器上项目路径
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
# --------------------------------

echo "=== 项目目录：$PROJECT_DIR ==="

# ---------- nginx 配置 ----------
echo ""
echo "=== 更新 nginx 配置 (本地宿主机) ==="

cp "$PROJECT_DIR/deploy/server/frontend.conf" "$NGINX_CONF_DIR/qiuqiuwriter-frontend.conf"
cp "$PROJECT_DIR/deploy/server/admin.conf"    "$NGINX_CONF_DIR/qiuqiuwriter-admin.conf"

ln -sf "$NGINX_CONF_DIR/qiuqiuwriter-frontend.conf" "$NGINX_ENABLED_DIR/qiuqiuwriter-frontend.conf"
ln -sf "$NGINX_CONF_DIR/qiuqiuwriter-admin.conf"    "$NGINX_ENABLED_DIR/qiuqiuwriter-admin.conf"
rm -f "$NGINX_ENABLED_DIR/default"

nginx -t
nginx -s reload
echo "  本地宿主机 nginx 配置已重新加载"

# ---------- 完成 ----------
echo ""
echo "==========================================="
echo " 本地 Nginx 配置部署/更新完成！"
echo " 前端：    http://<服务器IP>"
echo " 管理后台：http://<服务器IP>:8889"
echo "==========================================="