#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — первый деплой на VPS 188.241.217.76 (Ubuntu)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/opt/callcenter"
VPS_IP="188.241.217.76"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# Должен быть root
[[ $EUID -ne 0 ]] && error "Запуск: sudo bash deploy.sh"

info "Деплой на VPS $VPS_IP"

# ── 1. System packages ────────────────────────────────────────────────────────
info "Обновляем пакеты…"
apt-get update -qq
apt-get install -y -qq curl git nginx ufw

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    info "Устанавливаем Docker…"
    curl -fsSL https://get.docker.com | bash
    systemctl enable --now docker
else
    info "Docker уже установлен"
fi

if ! docker compose version &>/dev/null; then
    info "Устанавливаем Docker Compose plugin…"
    apt-get install -y -qq docker-compose-plugin
fi

# ── 3. Создаём директорию проекта ─────────────────────────────────────────────
mkdir -p "$APP_DIR"

info "Переносим файлы в $APP_DIR…"
# Предполагается что вы уже скопировали project/ на сервер
# Например: scp -r project/ root@188.241.217.76:/opt/callcenter/

cd "$APP_DIR"

# ── 4. Проверка .env ──────────────────────────────────────────────────────────
ENV_FILE="backend/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    error "Отсутствует $ENV_FILE — создайте его из backend/.env.example"
fi

# ── 5. Build + start ──────────────────────────────────────────────────────────
info "Запускаем docker compose…"
docker compose pull evolution-api
docker compose up -d --build

info "Ждём запуска сервисов (30 с)…"
sleep 30

# ── 6. Nginx ──────────────────────────────────────────────────────────────────
NGINX_CONF="/etc/nginx/sites-available/callcenter"
if [[ ! -f "$NGINX_CONF" ]]; then
    info "Настраиваем nginx…"
    cp deploy/nginx.conf "$NGINX_CONF"
    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/callcenter
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
else
    info "nginx уже настроен"
fi

# ── 7. Firewall ───────────────────────────────────────────────────────────────
info "UFW firewall…"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 3000/tcp comment 'Dashboard dev'
ufw --force enable

# ── Готово ────────────────────────────────────────────────────────────────────
echo ""
info "═══════════════════════════════════════════════════════════"
info "✅  Деплой завершён!"
info ""
info "  Backend:        http://$VPS_IP:3001/api"
info "  Health:         http://$VPS_IP:3001/health"
info "  Evolution API:  http://$VPS_IP:8080"
info ""
info "  Dashboard:      http://$VPS_IP:3000 (запустить отдельно)"
info ""
info "  Логи backend:   docker compose logs -f backend"
info "  Логи Evolution: docker compose logs -f evolution-api"
info ""
info "  Остановка:      docker compose down"
info "═══════════════════════════════════════════════════════════"
