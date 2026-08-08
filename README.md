# 🎯 WhatsApp Lead CRM Backend

**Backend API для диспетчерской системы захвата и управления лидами из WhatsApp**

## ✨ Главный принцип

**Админка = Диспетчер. Любое WhatsApp сообщение = Новый лид. 100% захват.**

## 📊 Архитектура

```
Instagram/Facebook Ads
        ↓
   WhatsApp
        ↓
Evolution API (webhook)
        ↓
    АДМИНКА (Диспетчер)
    ├─ Видит ВСЕ лиды
    └─ Распределяет вручную
        ↓
    ┌───┴───┐
    ↓       ↓
Оператор1  Оператор2
(свои лиды) (свои лиды)
    ↓       ↓
  Звонит  Звонит
```

## Функциональность

- ✅ Автоматический захват лидов из WhatsApp (любое сообщение = новый лид)
- ✅ Определение процедуры по ключевым словам
- ✅ Проверка дубликатов клиентов
- ✅ Автоматическое распределение операторам (Round Robin / Least Busy)
- ✅ Real-time обновления через WebSocket
- ✅ Автоматические Excel отчеты (дневные и ночные)
- ✅ JWT авторизация с ролями (Admin, Operator)
- ✅ История звонков и назначений
- ✅ Статистика и аналитика

## Технологии

- **NestJS** - backend framework
- **TypeScript** - язык программирования
- **Prisma ORM** - работа с БД
- **PostgreSQL** - база данных
- **Redis** - кэш и очереди
- **BullMQ** - планировщик задач
- **WebSocket** - real-time обновления
- **ExcelJS** - генерация Excel отчетов
- **JWT** - авторизация
- **Docker** - контейнеризация

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка окружения

```bash
cp .env.example .env
```

Отредактируйте `.env` файл с вашими настройками.

### 3. Запуск PostgreSQL и Redis

```bash
docker-compose up -d postgres redis
```

### 4. Применение миграций

```bash
npm run prisma:migrate
```

### 5. Генерация Prisma Client

```bash
npm run prisma:generate
```

### 6. (Опционально) Заполнение тестовыми данными

```bash
npm run prisma:seed
```

### 7. Запуск в режиме разработки

```bash
npm run start:dev
```

API будет доступен по адресу: `http://localhost:3000`

Swagger документация: `http://localhost:3000/api/docs`

## Запуск в продакшене

### Через Docker Compose

```bash
docker-compose up -d
```

### Вручную на VPS

```bash
# Сборка
npm run build

# Запуск
npm run start:prod
```

## Основные эндпоинты

### Авторизация

- `POST /api/v1/auth/login` - Вход
- `POST /api/v1/auth/register` - Регистрация
- `GET /api/v1/auth/me` - Текущий пользователь

### Лиды

- `GET /api/v1/leads` - Список лидов
- `GET /api/v1/leads/:id` - Детали лида
- `PATCH /api/v1/leads/:id/status` - Изменить статус
- `PATCH /api/v1/leads/:id/operator` - Переназначить оператора

### Клиенты

- `GET /api/v1/clients` - Список клиентов
- `GET /api/v1/clients/:id` - Детали клиента
- `GET /api/v1/clients/:id/history` - История клиента

### Операторы

- `GET /api/v1/operators` - Список операторов
- `GET /api/v1/operators/:id/stats` - Статистика оператора
- `GET /api/v1/operators/my-leads` - Мои лиды (для оператора)

### Процедуры

- `GET /api/v1/procedures` - Список процедур
- `POST /api/v1/procedures` - Создать процедуру
- `PATCH /api/v1/procedures/:id` - Обновить процедуру
- `DELETE /api/v1/procedures/:id` - Удалить процедуру

### WhatsApp

- `POST /api/v1/whatsapp/webhook` - Webhook от Evolution API
- `GET /api/v1/whatsapp/accounts` - Список подключенных WhatsApp
- `POST /api/v1/whatsapp/connect` - Подключить WhatsApp

### Отчеты

- `GET /api/v1/reports/today` - Сегодняшние лиды
- `GET /api/v1/reports/yesterday` - Вчерашние лиды
- `GET /api/v1/reports/night` - Ночные лиды
- `GET /api/v1/reports/excel` - Скачать Excel отчет

### Dashboard

- `GET /api/v1/dashboard/stats` - Общая статистика
- `GET /api/v1/dashboard/chart` - Данные для графиков

## WebSocket события

### Подключение

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});
```

### События

- `lead:new` - Новый лид создан
- `lead:updated` - Лид обновлен
- `lead:assigned` - Лид назначен оператору
- `stats:updated` - Статистика обновлена

## Структура БД

- `users` - Пользователи системы
- `roles` - Роли (Admin, Operator)
- `operators` - Операторы (расширение users)
- `clients` - Клиенты
- `leads` - Лиды
- `procedures` - Процедуры
- `messages` - История сообщений WhatsApp
- `calls` - История звонков
- `appointments` - Записи на процедуры
- `whatsapp_accounts` - Подключенные WhatsApp аккаунты
- `audit_logs` - Аудит действий

## Автоматизация

### Ночной отчет

Генерируется автоматически в **09:00** для лидов с **19:00** до **09:00**.

### Дневной отчет

Генерируется автоматически в **20:00** для лидов с **00:00** до **19:00**.

## Настройка Evolution API

1. Установите Evolution API на отдельный сервер
2. Создайте инстанс
3. Настройте webhook на `https://your-backend.com/api/v1/whatsapp/webhook`
4. Укажите API key в `.env`

## Мониторинг

Логи доступны через Winston:

```bash
# Просмотр логов
docker-compose logs -f backend
```

## Поддержка

По вопросам обращайтесь к команде разработки.
