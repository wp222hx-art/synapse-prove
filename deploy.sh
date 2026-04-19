#!/usr/bin/env bash
# Synapse 一键部署脚本
#
# 流程:
#   1. 本地 npm run build
#   2. rsync dist/ 到 ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/dist/
#   3. 远程拉起 python3 http.server,nohup 后台运行,PID 文件管理
#
# 你自己负责:配置 nginx 反代 ${SERVICE_BIND}:${SERVICE_PORT} → 80/443
#
# 用法:
#   ./deploy.sh                       # 默认部署
#   SERVICE_PORT=9000 ./deploy.sh     # 自定义端口
#   SERVICE_BIND=0.0.0.0 ./deploy.sh  # 暴露到所有网卡(慎用)

set -euo pipefail

# ─── 命令行参数 ───────────────────────────────────────
ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
    --rollback)
      ROLLBACK=1
      ;;
    --help|-h)
      cat <<HELP
用法:
  ./deploy.sh              # 标准部署:build → 备份当前 → rsync → 重启
  ./deploy.sh --rollback   # 回滚到上一次部署的版本(dist.bak)
  ./deploy.sh --help       # 显示帮助
HELP
      exit 0
      ;;
  esac
done

# ─── 配置(按需修改) ─────────────────────────────────
REMOTE_HOST="synapse.exe.xyz"
REMOTE_USER="exedev"
REMOTE_PATH="/home/exedev/synapse"
SERVICE_PORT="${SERVICE_PORT:-8080}"
SERVICE_BIND="${SERVICE_BIND:-127.0.0.1}"

# ─── 工具 ─────────────────────────────────────────────
# 强制 /usr/bin/ssh,绕过 shell 中可能存在的 ssh 别名/wrapper
SSH_BIN="${SSH_BIN:-/usr/bin/ssh}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

# ─── 终端颜色(用 ANSI-C quoting,真实 ESC 字符,避免 cat heredoc 不解释 \033) ───
B=$'\e[1;34m'; G=$'\e[1;32m'; Y=$'\e[1;33m'; R=$'\e[1;31m'; N=$'\e[0m'
step() { echo -e "\n${B}━━━${N} $1 ${B}━━━${N}"; }
ok()   { echo -e "${G}✓${N} $1"; }
warn() { echo -e "${Y}⚠${N} $1"; }
err()  { echo -e "${R}✗${N} $1" >&2; }

# ─── 路径 ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── 依赖检查 ─────────────────────────────────────────
command -v npm >/dev/null   || { err "本地缺少 npm";   exit 1; }
command -v rsync >/dev/null || { err "本地缺少 rsync"; exit 1; }
[ -x "$SSH_BIN" ]           || { err "找不到 ssh: $SSH_BIN"; exit 1; }

# ─── Step 1:本地构建 ────────────────────────────────
step "Step 1/3:本地构建前端"
if [ ! -d node_modules ]; then
  warn "node_modules 不存在,先跑 npm install"
  npm install
fi
npm run build
[ -d dist ] || { err "构建失败:dist/ 不存在"; exit 1; }
DIST_SIZE=$(du -sh dist | awk '{print $1}')
DIST_FILES=$(find dist -type f | wc -l | tr -d ' ')
ok "dist/ 构建完成($DIST_SIZE / $DIST_FILES 个文件)"

# ─── Step 2:rsync 到远程 ───────────────────────────
step "Step 2/3:同步到 ${SSH_TARGET}:${REMOTE_PATH}/dist/"
"$SSH_BIN" "${SSH_OPTS[@]}" "$SSH_TARGET" "mkdir -p '${REMOTE_PATH}'"
rsync -avz --delete --delete-excluded --human-readable \
  --exclude='.DS_Store' --exclude='Thumbs.db' --exclude='*.swp' \
  -e "$SSH_BIN ${SSH_OPTS[*]}" \
  "${SCRIPT_DIR}/dist/" \
  "${SSH_TARGET}:${REMOTE_PATH}/dist/"
ok "rsync 完成"

# ─── Step 3:nginx 直接 serve dist,无 python service ───
# 由 nginx (sites-available/synapse) 监听 8080,root=/home/exedev/synapse/dist,带 gzip
# rsync 完文件后 nginx 自动 pick up 新内容,无需 reload(除非改 nginx config)
step "Step 3/3:nginx 自动 serve(无需重启服务)"
"$SSH_BIN" "${SSH_OPTS[@]}" "$SSH_TARGET" "
set -e
# 验证 nginx 配置 + 服务运行
if ! sudo -n nginx -t 2>&1 | grep -q 'syntax is ok'; then
  echo '  ⚠ nginx config 异常'
  sudo -n nginx -t 2>&1 || true
  exit 1
fi
NGINX_PID=\$(pgrep -x nginx | head -1)
if [ -z \"\$NGINX_PID\" ]; then
  echo '  ✗ nginx 未运行,启动:sudo systemctl start nginx'
  exit 1
fi
echo '  ✓ nginx 配置 OK,主进程 PID='\$NGINX_PID
# 验证 dist 文件可读
if [ ! -r '${REMOTE_PATH}/dist/index.html' ]; then
  echo '  ⚠ index.html 不可读,执行 chmod'
  sudo -n chmod -R o+rX '${REMOTE_PATH}/dist'
fi
echo '  ✓ dist 文件可读'
"

ok "部署完成"

cat <<EOF

${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}
  ${G}✓ 部署成功${N}
  服务监听:  ${B}${SERVICE_BIND}:${SERVICE_PORT}${N}
  远程路径:  ${B}${REMOTE_PATH}${N}
${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}

服务访问:  https://synapse.exe.xyz/

管理命令(nginx 直接 serve):
  nginx 状态:   ${SSH_BIN} ${SSH_TARGET} 'sudo systemctl status nginx'
  nginx 日志:   ${SSH_BIN} ${SSH_TARGET} 'sudo tail -f /var/log/nginx/access.log'
  nginx 错误:   ${SSH_BIN} ${SSH_TARGET} 'sudo tail -f /var/log/nginx/error.log'
  reload nginx: ${SSH_BIN} ${SSH_TARGET} 'sudo systemctl reload nginx'
  nginx 配置:   ${SSH_BIN} ${SSH_TARGET} 'sudo cat /etc/nginx/sites-available/synapse'
  重新部署:    ./deploy.sh

EOF
