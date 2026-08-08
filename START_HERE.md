# 🚀 START HERE - Быстрый старт системы

## ✅ Что уже готово

**Backend полностью реализован!**

### Модули (11 штук):
- ✅ **Auth** - JWT авторизация с ролями (Admin/Operator)
- ✅ **WhatsApp** - Evolution API + 100% Lead Capture + Webhook
- ✅ **Leads** - Управление лидами + назначение операторов
- ✅ **Operators** - Операторы + статистика + leaderboard
- ✅ **Clients** - Клиенты + проверка дубликатов
- ✅ **Procedures** - Процедуры + keyword matching
- ✅ **Appointments** - Записи на процедуры
- ✅ **Reports** - Excel отчеты + автоматическое расписание
- ✅ **Dashboard** - Статистика + графики
- ✅ **WebSocket** - Real-time обновления
- ✅ **Users** - Управление пользователями

### Сервисы WhatsApp:
- ✅ **MessageParserService** - Парсинг сообщений из webhook
- ✅ **ProcedureMatcherService** - Определение процедуры по keywords
- ✅ **LeadParserService** - 100% захват лидов + защита от дубликатов

### База данных:
- ✅ **Prisma schema** готова (users, operators, clients, leads, procedures, messages, appointments, whatsapp_accounts, audit_logs, settings)
- ✅ **Seed данные** (admin + 3 оператора + 5 процедур)

## 📝 Чеклист установки

### 1️⃣ Установить зависимости

```bash
cd backend
npm install
```

**Ожидаемый результат:** `added 500+ packages`

### 2️⃣ Запустить PostgreSQL и Redis

```bash
docker-compose up -d postgres redis
```

**Проверка:**
```bash
docker-compose ps
```

Должно быть:
- ✅ whatsapp-crm-postgres (Up)
- ✅ whatsapp-crm-redis (Up)

### 3️⃣ Настроить .env

```bash
cp .env.example .env
nano .env  # или любой редактор
```

**Минимум для локального запуска:**
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/whatsapp_lead_crm"
REDIS_HOST=localhost
JWT_SECRET=my-local-secret-key
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-key-here
```

### 4️⃣ Создать базу данных

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

**Проверка:**
```bash
docker exec -it whatsapp-crm-postgres psql -U postgres -d whatsapp_lead_crm -c "SELECT email, role FROM users;"
```

Должно показать:
```
          email          | role
-------------------------+------
 admin@callcenter.com    | ADMIN
 aizhan@callcenter.com   | OPERATOR
 maria@callcenter.com    | OPERATOR
 olga@callcenter.com     | OPERATOR
```

### 5️⃣ Запустить backend

```bash
npm run start:dev
```

**Проверка:**

Откройте в браузере: **http://localhost:3000/api/v1**

Должно показать:
```json
{"statusCode":404,"message":"Cannot GET /api/v1","error":"Not Found"}
```

Это нормально! API работает.

**Swagger документация:** http://localhost:3000/api/docs

### 6️⃣ Протестировать API

```bash
# Логин админа
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@callcenter.com",
    "password": "admin123"
  }'
```

**Ожидаемый результат:**
```json
{
  "accessToken": "eyJhbGc...",
  "user": {
    "id": "...",
    "email": "admin@callcenter.com",
    "name": "Администратор",
    "role": "ADMIN"
  }
}
```

✅ **Backend работает!**

## 🔗 Следующие шаги

### 1. Подключить Evolution API

**Вариант A: Локально через Docker**

```bash
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY="my-secret-key" \
  atendai/evolution-api:latest
```

**Вариант B: Использовать существующий**

Если Evolution API уже запущен, просто укажите URL в `.env`:

```env
EVOLUTION_API_URL=https://your-evolution-url.com
EVOLUTION_API_KEY=your-api-key
```

### 2. Создать WhatsApp инстанс

Через Swagger (http://localhost:3000/api/docs):

```
POST /api/v1/whatsapp/connect
{
  "instanceName": "lead-automation",
  "webhookUrl": "http://your-backend-url/api/v1/whatsapp/webhook"
}
```

Или через Admin Panel (когда frontend запущен).

### 3. Отсканировать QR-код

Ответ содержит QR-код - отсканируйте его в WhatsApp.

### 4. Протестировать webhook

```bash
curl -X POST http://localhost:3000/api/v1/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "data": {
      "key": {
        "remoteJid": "77771234567@s.whatsapp.net",
        "fromMe": false,
        "id": "test-123"
      },
      "message": {
        "conversation": "Хочу RF-лифтинг"
      },
      "pushName": "Тест",
      "messageTimestamp": 1691234567
    }
  }'
```

**Проверка создания лида:**

```bash
curl http://localhost:3000/api/v1/leads \
  -H "Authorization: Bearer {your-admin-token}"
```

Должен появиться новый лид!

## 📊 Проверка работы системы

### Тест 1: Вход админа

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@callcenter.com","password":"admin123"}'
```

✅ Должен вернуть token

### Тест 2: Получить операторов

```bash
curl http://localhost:3000/api/v1/operators \
  -H "Authorization: Bearer {token}"
```

✅ Должен вернуть 3 операторов (Айжан, Мария, Ольга)

### Тест 3: Получить процедуры

```bash
curl http://localhost:3000/api/v1/procedures \
  -H "Authorization: Bearer {token}"
```

✅ Должен вернуть 5 процедур (RF-лифтинг, Трихология, и т.д.)

### Тест 4: Dashboard статистика

```bash
curl http://localhost:3000/api/v1/dashboard/stats \
  -H "Authorization: Bearer {token}"
```

✅ Должен вернуть статистику

## 🌐 Запуск Frontend

### Admin Panel

```bash
cd ../project/apps/admin
npm install
npm run dev
```

Откроется: http://localhost:5173

Логин: `admin@callcenter.com` / `admin123`

### Operator Panel

```bash
cd ../project/apps/operator
npm install
npm run dev
```

Откроется: http://localhost:5174

Логин: `aizhan@callcenter.com` / `operator123`

## 📚 Документация

- **SYSTEM_LOGIC.md** - Полная логика системы (как работает диспетчер)
- **DEPLOYMENT.md** - Production deployment на VPS
- **QUICKSTART.md** - Быстрый старт
- **README.md** - Общая информация

## 🔥 Частые проблемы

### Проблема: "Cannot connect to database"

**Решение:**
```bash
docker-compose up -d postgres
docker-compose logs postgres
```

Проверьте, что PostgreSQL запустился.

### Проблема: "Prisma schema not generated"

**Решение:**
```bash
npm run prisma:generate
```

### Проблема: "Port 3000 already in use"

**Решение:**
```bash
# Найти процесс
lsof -i :3000

# Убить процесс
kill -9 {PID}

# Или изменить PORT в .env
PORT=3001
```

### Проблема: "Redis connection refused"

**Решение:**
```bash
docker-compose up -d redis
docker-compose logs redis
```

### Проблема: "JWT token expired"

**Решение:**

Перелогиниться - получить новый token.

### Проблема: "Webhook не работает"

**Решение:**

1. Проверьте, что backend доступен извне (не localhost)
2. Проверьте webhook URL в Evolution API
3. Проверьте логи: `docker-compose logs -f backend`

## ✅ Финальная проверка

Если всё работает:

- [x] Backend запущен на http://localhost:3000
- [x] Swagger доступен на http://localhost:3000/api/docs
- [x] PostgreSQL работает (docker-compose ps)
- [x] Redis работает (docker-compose ps)
- [x] Можно залогиниться как админ
- [x] Можно получить список операторов
- [x] Можно получить список процедур
- [x] Можно создать тестовый webhook

**🎉 Система готова к работе!**

---

## 🚀 Production Deployment

Когда готовы к production:

1. Читайте **DEPLOYMENT.md**
2. Настройте VPS
3. Установите SSL
4. Подключите Evolution API
5. Запустите через Docker Compose
6. Подключите WhatsApp через QR

---

**Вопросы?** Читайте документацию в:
- `SYSTEM_LOGIC.md` - Как работает система
- `DEPLOYMENT.md` - Production setup
- `QUICKSTART.md` - Быстрый старт

**API документация:** http://localhost:3000/api/docs
