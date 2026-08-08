# ⚡ Quick Start - WhatsApp Lead CRM

## 🎯 Что делает система?

**WhatsApp → Backend → Админ распределяет → Оператор звонит**

### Главное правило: **100% захват лидов**

Любое сообщение в WhatsApp = новый лид:
- "Здравствуйте" ✅
- "Сәлеметсіз бе" ✅
- "👍" ✅
- "RF-лифтинг" ✅ (+ определит процедуру и цену)

**Ни один клиент не потеряется!**

## 🚀 Запуск за 5 минут

### 1. Установить зависимости

```bash
cd backend
npm install
```

### 2. Запустить PostgreSQL и Redis

```bash
docker-compose up -d postgres redis
```

### 3. Настроить .env

```bash
cp .env.example .env
```

**Минимальная конфигурация:**

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/whatsapp_lead_crm"
REDIS_HOST=localhost
JWT_SECRET=my-secret-key
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-api-key
```

### 4. Создать БД

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### 5. Запустить backend

```bash
npm run start:dev
```

✅ **Готово!** API: http://localhost:3000/api/v1

## 📝 Тестовые данные

После `npm run prisma:seed`:

**Админ:**
- Email: `admin@callcenter.com`
- Password: `admin123`

**Операторы:**
- `aizhan@callcenter.com` / `operator123`
- `maria@callcenter.com` / `operator123`
- `olga@callcenter.com` / `operator123`

**Процедуры:**
- RF-лифтинг (25,000 ₸)
- Трихология (30,000 ₸)
- Косметология (20,000 ₸)
- Массаж (15,000 ₸)
- Эпиляция (10,000 ₸)

## 🔌 Подключить WhatsApp

### Вариант 1: Через API

```bash
# 1. Создать инстанс
POST http://localhost:3000/api/v1/whatsapp/connect
{
  "instanceName": "lead-automation",
  "webhookUrl": "http://your-backend-url/api/v1/whatsapp/webhook"
}

# 2. Получить QR-код и отсканировать в WhatsApp

# 3. Проверить статус
GET http://localhost:3000/api/v1/whatsapp/accounts
```

### Вариант 2: Через Admin Panel

1. Открыть Admin Panel
2. Перейти в **WhatsApp** раздел
3. Нажать **"Подключить WhatsApp"**
4. Отсканировать QR-код

## 📊 Как работает система?

### Шаг 1: Клиент пишет в WhatsApp

```
Клиент → WhatsApp: "Сәлеметсіз бе, RF лифтинг керек"
```

### Шаг 2: Evolution API отправляет webhook

```
Evolution API → Backend: POST /api/v1/whatsapp/webhook
{
  "phone": "+77771234567",
  "name": "Алия",
  "message": "Сәлеметсіз бе, RF лифтинг керек"
}
```

### Шаг 3: Backend создает лид автоматически

```
✅ Lead created:
- Phone: +77771234567
- Name: Алия
- Message: Сәлеметсіз бе, RF лифтинг керек
- Procedure: RF-лифтинг (detected by keywords)
- Price: 25,000 ₸
- Status: NEW
- Assigned to: Айжан (Round Robin)
```

### Шаг 4: Админ видит лид сразу (WebSocket)

```
ADMIN PANEL → New Lead появился без перезагрузки страницы
```

### Шаг 5: Оператор звонит

```
OPERATOR PANEL (Айжан) → 
Мои лиды:
- Алия +77771234567
- RF-лифтинг 25,000 ₸

[Позвонить] → CALLING
```

### Шаг 6: Оператор меняет статус

```
Оператор звонит → уговаривает прийти → меняет статус:
- CALLING
- BOOKED ← Записан!
- FOLLOW_UP
- NO_ANSWER
- CLOSED
```

## 🎨 Архитектура

```
┌─────────────────────────────────────────────┐
│         Instagram / Facebook Ads            │
└──────────────────┬──────────────────────────┘
                   ↓
         ┌──────────────────┐
         │   WhatsApp       │
         └────────┬─────────┘
                  ↓
         ┌──────────────────┐
         │  Evolution API   │
         └────────┬─────────┘
                  ↓ webhook
         ┌──────────────────┐
         │  NestJS Backend  │
         │  ┌────────────┐  │
         │  │  Parser    │  │ ← 100% Lead Capture
         │  │  Matcher   │  │ ← Procedure Detection
         │  │  Assigner  │  │ ← Operator Assignment
         │  └────────────┘  │
         └────────┬─────────┘
                  ↓
    ┌─────────────┴──────────────┐
    ↓                            ↓
┌────────────┐           ┌────────────┐
│   ADMIN    │           │  OPERATOR  │
│ Dispatcher │           │   Panel    │
│            │           │            │
│ - Видит    │           │ - Видит    │
│   все лиды │           │   только   │
│            │           │   свои     │
│ - Назначает│           │            │
│   оператору│           │ - Звонит   │
│            │           │ - Меняет   │
│ - Управляет│           │   статус   │
└────────────┘           └────────────┘
```

## 📂 Структура проекта

```
backend/
├── src/
│   ├── modules/
│   │   ├── whatsapp/              # WhatsApp интеграция
│   │   │   ├── services/
│   │   │   │   ├── message-parser.service.ts    # Парсинг сообщений
│   │   │   │   ├── procedure-matcher.service.ts # Определение процедуры
│   │   │   │   └── lead-parser.service.ts       # 100% Lead Capture
│   │   │   ├── webhook.service.ts
│   │   │   └── evolution-api.service.ts
│   │   ├── leads/                 # Лиды
│   │   │   └── leads.service.ts   # Round Robin / Least Busy assignment
│   │   ├── operators/             # Операторы
│   │   ├── clients/               # Клиенты (дубликаты)
│   │   ├── procedures/            # Процедуры
│   │   ├── reports/               # Excel отчеты
│   │   ├── dashboard/             # Статистика
│   │   └── websocket/             # Real-time updates
│   └── app.module.ts
├── prisma/
│   └── schema.prisma              # База данных
├── .env.example
├── docker-compose.yml
├── DEPLOYMENT.md                  # Production guide
└── README.md
```

## 🔄 Логика распределения операторов

### Round Robin (по кругу)

```
Лид 1 → Айжан
Лид 2 → Мария
Лид 3 → Ольга
Лид 4 → Айжан  ← снова первый
Лид 5 → Мария
...
```

Настройка в `.env`:

```env
LEAD_ASSIGNMENT_STRATEGY=ROUND_ROBIN
```

### Least Busy (наименее занятый)

```
Айжан:  12 лидов
Мария:   8 лидов  ← новый лид пойдет сюда
Ольга:  15 лидов
```

Настройка в `.env`:

```env
LEAD_ASSIGNMENT_STRATEGY=LEAST_BUSY
```

## 📈 Отчеты

Автоматически генерируются:

**Ночной отчет** (19:00 - 09:00):
- Генерация: **09:00** каждый день
- Файл: `night_leads_YYYYMMDD.xlsx`

**Дневной отчет** (09:00 - 19:00):
- Генерация: **20:00** каждый день
- Файл: `day_leads_YYYYMMDD.xlsx`

Хранятся в: `./storage/reports/`

## 🧪 Тестирование webhook

```bash
# Симуляция входящего WhatsApp сообщения
curl -X POST http://localhost:3000/api/v1/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "data": {
      "key": {
        "remoteJid": "77771234567@s.whatsapp.net",
        "fromMe": false,
        "id": "test-message-123"
      },
      "message": {
        "conversation": "Сәлеметсіз бе, RF лифтинг керек"
      },
      "pushName": "Алия",
      "messageTimestamp": 1691234567
    }
  }'
```

Результат:
```json
{
  "success": true,
  "lead": {
    "id": "...",
    "clientId": "...",
    "operatorId": "...",
    "procedure": "RF-лифтинг",
    "price": 25000,
    "status": "ASSIGNED"
  }
}
```

## 📚 Swagger Documentation

После запуска откройте:

**http://localhost:3000/api/docs**

Там все endpoint'ы с примерами!

## 🔥 Частые вопросы

### Q: Что если процедура не определилась?

**A:** Лид всё равно создается! Оператор сам выяснит по телефону.

```
Lead:
- Phone: +777...
- Name: Алия
- Message: "Здравствуйте"
- Procedure: NULL  ← не определилась
- Status: ASSIGNED ← но лид создан!
```

### Q: Можно ли отключить автоматическое распределение?

**A:** Нет, это центральная логика системы. Админ может **переназначить** лид другому оператору вручную.

### Q: Как добавить новую процедуру?

**A:** Через API или Admin Panel:

```bash
POST /api/v1/procedures
{
  "name": "Новая процедура",
  "price": 35000,
  "keywords": ["keyword1", "keyword2", "ключевое слово"]
}
```

### Q: Как работает определение процедуры?

**A:** Система ищет keywords в тексте сообщения:

```
Сообщение: "Хочу RF лифтинг"
Keywords:  ["rf", "лифтинг", "lifting"]
Результат: RF-лифтинг ✅
```

### Q: Операторы видят лиды друг друга?

**A:** **НЕТ!** Каждый оператор видит только свои назначенные лиды.

## 🎯 Production Checklist

- [ ] Изменить `JWT_SECRET` на случайную строку
- [ ] Настроить `EVOLUTION_API_URL` на production URL
- [ ] Настроить `CORS_ORIGIN` на frontend URLs
- [ ] Запустить миграции: `npm run prisma:migrate`
- [ ] Настроить SSL (https)
- [ ] Настроить backup БД
- [ ] Протестировать webhook
- [ ] Подключить WhatsApp через QR

## 📞 Поддержка

Полное руководство: `DEPLOYMENT.md`

Swagger API: http://localhost:3000/api/docs

---

**Готово! Система работает. Каждое WhatsApp сообщение автоматически превращается в лид. Ни один клиент не потеряется! 🎉**
