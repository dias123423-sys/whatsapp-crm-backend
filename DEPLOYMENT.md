# 🚀 WhatsApp Lead CRM - Deployment Guide

## Архитектура системы

```
Instagram/Facebook Ads
        ↓
WhatsApp Message
        ↓
Evolution API (Webhook)
        ↓
Backend API (NestJS)
        ↓
┌───────────────────────┐
│  ADMIN DISPATCHER     │  ← Админ видит все лиды
│  - Распределяет лиды  │
│  - Управляет системой │
└───────────────────────┘
        ↓
┌───────────────────────┐
│   OPERATOR PANELS     │  ← Операторы видят только свои лиды
│  - Звонят клиентам    │
│  - Уговаривают прийти │
│  - Меняют статусы     │
└───────────────────────┘
```

## 🎯 Основная логика

**100% Lead Capture** - Любое WhatsApp сообщение создает лид:
- "Здравствуйте" → Lead ✅
- "Сәлеметсіз бе" → Lead ✅
- "👍" → Lead ✅
- "RF-лифтинг" → Lead ✅ (+ определена процедура и цена)

**Система работает как диспетчер:**
1. WhatsApp → Backend автоматически получает: телефон, имя, сообщение, время
2. Админ видит лид сразу (WebSocket real-time)
3. Админ назначает оператора
4. Оператор звонит клиенту
5. Оператор меняет статус (CALLING → BOOKED)

## 📋 Требования

- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- Evolution API (WhatsApp)
- Docker & Docker Compose

## 🔧 Локальная установка

### 1. Клонировать репозиторий

```bash
cd ~/Рабочий\ стол/call-center-main/backend
```

### 2. Установить зависимости

```bash
npm install
```

### 3. Настроить окружение

```bash
cp .env.example .env
```

Отредактировать `.env`:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/whatsapp_lead_crm"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-key-change-this
JWT_EXPIRES_IN=7d

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-evolution-api-key
EVOLUTION_INSTANCE_NAME=lead-automation

# CORS (Frontend URLs)
CORS_ORIGIN=http://localhost:5173,http://localhost:5174

# Lead Assignment Strategy
LEAD_ASSIGNMENT_STRATEGY=ROUND_ROBIN  # or LEAST_BUSY

# Report Schedule (Kazakhstan time)
NIGHT_REPORT_GENERATION_TIME=09:00  # Генерация в 09:00
DAY_REPORT_GENERATION_TIME=20:00     # Генерация в 20:00
```

### 4. Запустить PostgreSQL и Redis

```bash
docker-compose up -d postgres redis
```

### 5. Применить миграции

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 6. Заполнить тестовыми данными

```bash
npm run prisma:seed
```

Создаст:
- **Админ**: `admin@callcenter.com` / `admin123`
- **Операторы**: `aizhan@callcenter.com`, `maria@callcenter.com`, `olga@callcenter.com` / `operator123`
- **Процедуры**: RF-лифтинг, Трихология, Косметология, Массаж, Эпиляция

### 7. Запустить backend

```bash
npm run start:dev
```

API: http://localhost:3000/api/v1

Swagger: http://localhost:3000/api/docs

## 🌍 Production Deployment (VPS)

### Требования VPS

- Ubuntu 22.04 LTS
- 2 CPU, 4GB RAM minimum
- 20GB SSD
- Public IP

### 1. Подключиться к VPS

```bash
ssh root@your-vps-ip
```

### 2. Установить зависимости

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install -y docker-compose

# Install Nginx
apt install -y nginx

# Install Certbot for SSL
apt install -y certbot python3-certbot-nginx
```

### 3. Загрузить код

```bash
cd /var/www
git clone https://github.com/your-repo/call-center-backend.git
cd call-center-backend
```

### 4. Настроить .env для production

```bash
cp .env.example .env
nano .env
```

```env
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://postgres:strong_password@postgres:5432/whatsapp_lead_crm"
REDIS_HOST=redis
JWT_SECRET=generate-strong-random-secret-here
EVOLUTION_API_URL=https://evolution.yourdomain.com
CORS_ORIGIN=https://admin.yourdomain.com,https://operator.yourdomain.com
```

### 5. Запустить через Docker Compose

```bash
docker-compose up -d
```

Проверить логи:

```bash
docker-compose logs -f backend
```

### 6. Настроить Nginx

```bash
nano /etc/nginx/sites-available/backend-api
```

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Активировать:

```bash
ln -s /etc/nginx/sites-available/backend-api /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 7. Установить SSL

```bash
certbot --nginx -d api.yourdomain.com
```

### 8. Настроить Evolution API

Evolution API должен быть запущен отдельно (можно на том же VPS или другом).

#### Установка Evolution API:

```bash
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY="your-strong-api-key" \
  -e DATABASE_ENABLED=true \
  -e DATABASE_CONNECTION_URI="postgresql://postgres:password@postgres:5432/evolution" \
  atendai/evolution-api:latest
```

#### Webhook URL:

В вашем backend `.env`:

```env
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-strong-api-key
```

## 🔗 Подключение WhatsApp

### Через Admin Panel

1. Открыть **Admin Panel** → **WhatsApp**
2. Нажать **"Подключить WhatsApp"**
3. Отсканировать QR-код
4. WhatsApp подключен ✅

### Через API

```bash
POST /api/v1/whatsapp/connect
{
  "instanceName": "lead-automation",
  "webhookUrl": "https://api.yourdomain.com/api/v1/whatsapp/webhook"
}
```

Ответ содержит QR-код.

## 📊 Автоматические отчеты

Система автоматически генерирует Excel отчеты:

- **Ночной отчет** (19:00 - 09:00): генерируется в **09:00**
- **Дневной отчет** (09:00 - 19:00): генерируется в **20:00**

Отчеты сохраняются в `./storage/reports/`

## 🔐 Безопасность

1. **Изменить JWT_SECRET** на случайную строку
2. **Изменить пароли PostgreSQL**
3. **Настроить firewall**:

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```

4. **Регулярно обновлять систему**:

```bash
apt update && apt upgrade -y
```

## 📈 Мониторинг

### Проверка статуса

```bash
# Backend
docker-compose ps

# Logs
docker-compose logs -f backend

# Database
docker exec -it whatsapp-crm-postgres psql -U postgres -d whatsapp_lead_crm
```

### Backup Database

```bash
docker exec whatsapp-crm-postgres pg_dump -U postgres whatsapp_lead_crm > backup_$(date +%Y%m%d).sql
```

### Restore Database

```bash
docker exec -i whatsapp-crm-postgres psql -U postgres whatsapp_lead_crm < backup_20260808.sql
```

## 🎯 API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Вход
- `POST /api/v1/auth/register` - Регистрация
- `GET /api/v1/auth/me` - Текущий пользователь

### Leads (Лиды)
- `GET /api/v1/leads` - Список лидов
- `GET /api/v1/leads/:id` - Детали лида
- `PATCH /api/v1/leads/:id/status` - Изменить статус
- `PATCH /api/v1/leads/:id/reassign` - Переназначить оператора

### Operators (Операторы)
- `GET /api/v1/operators` - Список операторов
- `GET /api/v1/operators/:id/stats` - Статистика оператора
- `GET /api/v1/operators/leaderboard` - Лидерборд

### WhatsApp
- `POST /api/v1/whatsapp/webhook` - Webhook (public)
- `POST /api/v1/whatsapp/connect` - Подключить WhatsApp
- `GET /api/v1/whatsapp/accounts` - Список аккаунтов
- `POST /api/v1/whatsapp/send-message` - Отправить сообщение

### Reports (Отчеты)
- `POST /api/v1/reports/today` - Сегодняшний отчет
- `POST /api/v1/reports/night` - Ночной отчет
- `POST /api/v1/reports/day` - Дневной отчет
- `GET /api/v1/reports/download?filename=...` - Скачать отчет

### Dashboard
- `GET /api/v1/dashboard/stats` - Статистика
- `GET /api/v1/dashboard/leads-chart` - График лидов
- `GET /api/v1/dashboard/operators-performance` - Производительность операторов

## 🌐 Frontend Deployment

Admin Panel и Operator Panel деплоятся на **Vercel**:

```bash
# Admin Panel
cd project/apps/admin
vercel --prod

# Operator Panel
cd project/apps/operator
vercel --prod
```

В `.env` frontend указать:

```env
VITE_API_URL=https://api.yourdomain.com/api/v1
VITE_WS_URL=https://api.yourdomain.com
```

## 📞 Support

По вопросам: admin@yourdomain.com
