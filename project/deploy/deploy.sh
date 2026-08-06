#!/usr/bin/env bash
# deploy.sh — первый деплой на VPS 188.241.217.76 (Ubuntu)
set -euo pipefail

APP_DIR="/opt/callcenter"
VPS_IP="188.241.217.76"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && error "Запуск: sudo bash deploy.sh"

info "Деплой на VPS $VPS_IP"

# ── 1. System packages ────────────────────────────────────────────────────────
info "Обновляем пакеты..."
apt-get update -qq
apt-get install -y -qq curl git nginx ufw

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    info "Устанавливаем Docker..."
    curl -fsSL https://get.docker.com | bash
    systemctl enable --now docker
else
    info "Docker уже установлен"
fi

if ! docker compose version &>/dev/null; then
    info "Устанавливаем Docker Compose plugin..."
    apt-get install -y -qq docker-compose-plugin
fi

# ── 3. Директория проекта ─────────────────────────────────────────────────────
mkdir -p "$APP_DIR"
info "Копируем файлы в $APP_DIR..."
# Предполагается: scp -r project/ root@188.241.217.76:/opt/callcenter/

cd "$APP_DIR"

# ── 4. Backend .env ───────────────────────────────────────────────────────────
if [[ ! -f "backend/.env" ]]; then
    cp backend/.env.example backend/.env
    warn "Создан backend/.env из .env.example — ЗАПОЛНИТЕ ЗНАЧЕНИЯ!"
    warn "Особенно: JWT_SECRET, EVOLUTION_API_KEY"
fi

# ── 5. Build + Start ──────────────────────────────────────────────────────────
info "Запускаем docker compose..."
docker compose pull evolution-api || true
docker compose up -d --build

info "Ждём запуска сервисов (40 сек)..."
sleep 40

# ── 6. DB Migrate + Seed ──────────────────────────────────────────────────────
info "Применяем миграции..."
docker compose exec backend npx prisma migrate deploy || warn "Миграции уже применены"

info "Заполняем начальные данные..."
docker compose exec backend npx ts-node prisma/seed.ts || warn "Seed уже выполнен"

# ── 7. Nginx ──────────────────────────────────────────────────────────────────
NGINX_CONF="/etc/nginx/sites-available/callcenter"
if [[ ! -f "$NGINX_CONF" ]]; then
    info "Настраиваем nginx..."
    cp deploy/nginx.conf "$NGINX_CONF"
    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/callcenter
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
else
    info "Nginx уже настроен"
fi

# ── 8. Firewall ───────────────────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
info "═══════════════════════════════════════════════════════════"
info "✅  Деплой завершён!"
info ""
info "  Админка:        http://$VPS_IP:3000"
info "  Панель оп-ра:   http://$VPS_IP:3002"
info "  Backend API:    http://$VPS_IP:3001/api"
info "  API Docs:       http://$VPS_IP:3001/api/docs"
info "  Evolution API:  http://$VPS_IP:8080"
info ""
info "  Логин (admin):    admin@callcenter.kz / admin123"
info "  Логин (оператор): aizhan@callcenter.kz / operator123"
info ""
info "  Логи backend:   docker compose logs -f backend"
info "  Остановка:      docker compose down"
info "═══════════════════════════════════════════════════════════"
