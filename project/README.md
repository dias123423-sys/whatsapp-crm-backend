# Call Center — Lead Automation System

## Архитектура

```
Instagram/Facebook Ads
        ↓
WhatsApp (4 номера)
        ↓
Evolution API  ←── webhook ──→  Backend (NestJS)
                                        ↓
                               Анализ сообщения:
                               - имя, телефон
                               - процедура (по ключевым словам)
                               - цена, источник, время, период
                                        ↓
                               Создаётся Лид (NEW)
                                        ↓
                    ┌───────── Админка (React) ──────────┐
                    │  Видит всех лидов                  │
                    │  Назначает операторов              │
                    │  Управляет WhatsApp (4 номера)     │
                    │  Процедуры + цены                  │
                    │  Отчёты Excel (скачивание)         │
                    └───────────────┬────────────────────┘
                                    ↓ назначить
                    ┌───── Панель оператора (React) ─────┐
                    │  Видит ТОЛЬКО своих клиентов       │
                    │  Звонит (tel: ссылка)              │
                    │  Пишет комментарии                 │
                    │  Меняет статус                     │
                    └────────────────────────────────────┘
```

## Стек

| Слой | Технология |
|------|-----------|
| Backend | NestJS, TypeScript, Prisma ORM |
| База данных | PostgreSQL 16 |
| Кэш / Очереди | Redis 7, BullMQ |
| WhatsApp | Evolution API |
| Admin Panel | React 18, Vite, Tailwind CSS |
| Operator Panel | React 18, Vite, Tailwind CSS |
| Инфраструктура | Docker Compose, Nginx, Ubuntu |

## Статусы лидов

| Статус | Описание |
|--------|---------|
| `NEW` | Только поступил из WhatsApp |
| `CALLING` | Оператор звонит |
| `BOOKED` | Клиент записан |
| `FOLLOW_UP` | Нужно перезвонить |
| `NO_ANSWER` | Не отвечает |
| `CLOSED` | Закрыт |

## Ночной режим (19:00 – 08:00)

Лиды автоматически получают период `NIGHT`.  
Каждый день в **08:00** система генерирует `Night_Leads_Report.xlsx`.

---

## Быстрый старт (локально)

### 1. Backend

```bash
cd project/backend
cp .env.example .env        # заполните значения
npm install
npx prisma generate
npx prisma migrate deploy
npx ts-node prisma/seed.ts  # создаёт admin + оператора + процедуры
npm run start:dev
```

### 2. Admin Panel

```bash
cd project/apps/admin
npm install
npm run dev                 # http://localhost:3000
```

### 3. Operator Panel

```bash
cd project/apps/operator
npm install
npm run dev                 # http://localhost:3002
```

### 4. Evolution API (Docker)

```bash
cd project
docker compose up -d postgres redis evolution-api
```

---

## Деплой на VPS (Ubuntu)

```bash
# Скопировать проект на сервер
scp -r project/ root@188.241.217.76:/opt/callcenter/

# Подключиться и запустить
ssh root@188.241.217.76
cd /opt/callcenter
sudo bash deploy/deploy.sh
```

После деплоя:

| Сервис | URL |
|--------|-----|
| Админка | http://188.241.217.76:3000 |
| Панель оператора | http://188.241.217.76:3002 |
| Backend API | http://188.241.217.76:3001/api |
| API Docs (Swagger) | http://188.241.217.76:3001/api/docs |
| Evolution API | http://188.241.217.76:8080 |

---

## Логины по умолчанию

| Роль | Email | Пароль |
|------|-------|--------|
| Администратор | admin@callcenter.kz | admin123 |
| Оператор | aizhan@callcenter.kz | operator123 |

> **Обязательно смените пароли после первого входа!**

---

## Подключение WhatsApp

1. Войти в Админку → раздел **WhatsApp**
2. Нажать **"Добавить номер"**, ввести название (например `whatsapp-1`)
3. Нажать **"QR-код"** на созданной карточке
4. В телефоне: WhatsApp → Настройки → Связанные устройства → Привязать
5. Статус изменится на **ONLINE**

Webhook URL для Evolution API:
```
http://YOUR_SERVER/api/webhook/evolution
```

---

## Обновление

```bash
ssh root@188.241.217.76
cd /opt/callcenter
sudo bash deploy/update.sh
```

---

## Структура проекта

```
project/
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/           # JWT аутентификация
│   │   │   ├── users/          # Пользователи
│   │   │   ├── operators/      # Операторы
│   │   │   ├── leads/          # Лиды (основная логика)
│   │   │   ├── clients/        # Клиенты
│   │   │   ├── whatsapp/       # Evolution API + Webhook
│   │   │   ├── procedures/     # Процедуры и цены
│   │   │   ├── assignment/     # Round Robin / Least Busy
│   │   │   ├── calls/          # Логирование звонков
│   │   │   ├── reports/        # Excel отчёты + планировщик
│   │   │   └── notifications/  # WebSocket уведомления
│   │   └── prisma/             # Prisma service
│   └── prisma/
│       ├── schema.prisma       # Схема БД
│       └── seed.ts             # Начальные данные
│
├── apps/
│   ├── admin/                  # Админская панель (React)
│   │   └── src/
│   │       ├── pages/          # Dashboard, Leads, Operators, WhatsApp, Procedures, Reports, Settings
│   │       ├── api/            # axios клиенты
│   │       ├── components/     # Layout, Modal, StatusBadge
│   │       └── store/          # Zustand (auth)
│   │
│   └── operator/               # Панель оператора (React)
│       └── src/
│           ├── pages/          # LeadsListPage, ClientCardPage
│           ├── api/            # axios клиенты
│           ├── components/     # Layout (WebSocket)
│           └── store/          # Zustand (auth)
│
├── deploy/
│   ├── deploy.sh               # Первый деплой
│   ├── update.sh               # Обновление
│   └── nginx.conf              # Nginx конфиг
│
└── docker-compose.yml          # Все сервисы
```
