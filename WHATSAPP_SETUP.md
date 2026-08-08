# 📱 Подключение 4 WhatsApp номеров

## Схема подключения

```
┌─────────────────────────────────────────┐
│   Evolution API (сервер)                │
│   http://188.241.217.76:8080            │
├─────────────────────────────────────────┤
│                                         │
│  Instance 1: whatsapp-1                 │
│  Instance 2: whatsapp-2                 │
│  Instance 3: whatsapp-3                 │
│  Instance 4: whatsapp-4                 │
│                                         │
│  Webhook: http://188.241.217.76:3000/   │
│           api/v1/whatsapp/webhook       │
└─────────────────────────────────────────┘
```

## 🚀 Быстрое подключение

### Шаг 1: Установить Evolution API

**На VPS сервере (188.241.217.76):**

```bash
ssh root@188.241.217.76
# Password: Cococage_1234

# Установить Docker (если еще нет)
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Запустить Evolution API
docker run -d \
  --name evolution-api \
  --restart always \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY="your-strong-secret-key-2026" \
  -e DATABASE_ENABLED=false \
  atendai/evolution-api:latest
```

**Проверка:**

```bash
curl http://localhost:8080
```

Должен вернуть ответ от Evolution API ✅

### Шаг 2: Обновить .env на VPS

```bash
nano /var/www/whatsapp-crm/.env
```

Добавить:

```env
# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-strong-secret-key-2026

# WhatsApp Instances
WHATSAPP_INSTANCE_1=whatsapp-1
WHATSAPP_INSTANCE_2=whatsapp-2
WHATSAPP_INSTANCE_3=whatsapp-3
WHATSAPP_INSTANCE_4=whatsapp-4
```

Перезапустить backend:

```bash
pm2 restart whatsapp-crm-api
```

### Шаг 3: Подключить WhatsApp #1

**Через API (curl):**

```bash
curl -X POST http://188.241.217.76:3000/api/v1/whatsapp/connect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "instanceName": "whatsapp-1",
    "webhookUrl": "http://188.241.217.76:3000/api/v1/whatsapp/webhook"
  }'
```

**Ответ:**

```json
{
  "id": "...",
  "instanceName": "whatsapp-1",
  "qrCode": "data:image/png;base64,iVBORw0KG...",
  "status": "CONNECTING"
}
```

**Отсканировать QR:**
1. Скопировать base64 QR-код
2. Вставить в браузер (data:image/...)
3. Отсканировать WhatsApp на телефоне
4. WhatsApp подключен! ✅

### Шаг 4: Подключить WhatsApp #2, #3, #4

**Повторить для каждого:**

```bash
# WhatsApp 2
curl -X POST http://188.241.217.76:3000/api/v1/whatsapp/connect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "instanceName": "whatsapp-2",
    "webhookUrl": "http://188.241.217.76:3000/api/v1/whatsapp/webhook"
  }'

# WhatsApp 3
curl -X POST http://188.241.217.76:3000/api/v1/whatsapp/connect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "instanceName": "whatsapp-3",
    "webhookUrl": "http://188.241.217.76:3000/api/v1/whatsapp/webhook"
  }'

# WhatsApp 4
curl -X POST http://188.241.217.76:3000/api/v1/whatsapp/connect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "instanceName": "whatsapp-4",
    "webhookUrl": "http://188.241.217.76:3000/api/v1/whatsapp/webhook"
  }'
```

## 📱 Через Admin Panel (проще!)

### 1. Открыть Admin Panel

```
http://188.241.217.76:5173
```

Логин: `admin@callcenter.com` / `admin123`

### 2. Перейти в раздел WhatsApp

```
Меню → WhatsApp → Управление
```

### 3. Добавить аккаунт

```
[+ Добавить WhatsApp]

Instance Name: whatsapp-1
[Подключить]

→ Появится QR-код
→ Отсканировать WhatsApp
→ Подключено! ✅
```

### 4. Повторить для 3 остальных

Добавить:
- whatsapp-2
- whatsapp-3
- whatsapp-4

## 🔍 Проверка статуса

**Через API:**

```bash
curl http://188.241.217.76:3000/api/v1/whatsapp/accounts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Ответ:**

```json
{
  "data": [
    {
      "id": "...",
      "instanceName": "whatsapp-1",
      "phone": "+77771234567",
      "name": "Clinic WhatsApp",
      "status": "CONNECTED",
      "active": true
    },
    {
      "id": "...",
      "instanceName": "whatsapp-2",
      "status": "CONNECTED",
      ...
    },
    ...
  ]
}
```

## 📨 Тест webhook

После подключения, отправьте тестовое сообщение:

```bash
# Отправить тест на WhatsApp 1
# Клиент пишет: "Саламатсызба"
```

**В логах должно появиться:**

```
📨 Received webhook event: messages.upsert
✅ Lead created: ... | Client: +777... | Procedure: NO | Period: DAY
```

**В админке появится новый лид!**

## ⚙️ Настройка Evolution API

### Изменить API Key

```bash
docker stop evolution-api
docker rm evolution-api

docker run -d \
  --name evolution-api \
  --restart always \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY="MY-NEW-SECRET-KEY-2026" \
  atendai/evolution-api:latest
```

Обновить в backend `.env`:

```env
EVOLUTION_API_KEY=MY-NEW-SECRET-KEY-2026
```

### Включить Database (опционально)

Для сохранения сессий WhatsApp:

```bash
docker run -d \
  --name evolution-api \
  --restart always \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY="your-key" \
  -e DATABASE_ENABLED=true \
  -e DATABASE_CONNECTION_URI="postgresql://postgres:Cococage_1234@172.16.0.2:5432/evolution" \
  atendai/evolution-api:latest
```

## 🔄 Переподключение WhatsApp

Если WhatsApp отключился:

```bash
curl -X POST http://188.241.217.76:3000/api/v1/whatsapp/connect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "instanceName": "whatsapp-1"
  }'
```

Получить новый QR-код и отсканировать.

## 📊 Мониторинг

### Логи Evolution API

```bash
docker logs -f evolution-api
```

### Статус всех инстансов

```bash
curl http://localhost:8080/instance/fetchInstances \
  -H "apikey: your-key"
```

### Webhook история

Все входящие сообщения логируются в backend:

```bash
pm2 logs whatsapp-crm-api | grep "webhook"
```

## 🚨 Troubleshooting

### WhatsApp не подключается

1. **Проверить Evolution API:**
   ```bash
   curl http://localhost:8080
   ```

2. **Проверить логи:**
   ```bash
   docker logs evolution-api
   ```

3. **Попробовать переподключить:**
   - Удалить инстанс
   - Создать заново

### Webhook не приходит

1. **Проверить webhook URL:**
   ```bash
   curl http://188.241.217.76:3000/api/v1/whatsapp/webhook
   ```

2. **Проверить backend работает:**
   ```bash
   pm2 status
   pm2 logs whatsapp-crm-api
   ```

3. **Переустановить webhook:**
   ```bash
   curl -X POST http://188.241.217.76:3000/api/v1/whatsapp/set-webhook \
     -H "Content-Type: application/json" \
     -d '{
       "instanceName": "whatsapp-1",
       "webhookUrl": "http://188.241.217.76:3000/api/v1/whatsapp/webhook"
     }'
   ```

### QR-код не появляется

1. Проверить инстанс создан:
   ```bash
   curl http://localhost:8080/instance/fetchInstances \
     -H "apikey: your-key"
   ```

2. Удалить и создать заново:
   ```bash
   curl -X DELETE http://localhost:8080/instance/logout/whatsapp-1 \
     -H "apikey: your-key"
   ```

## 📝 Итоговая конфигурация

**На VPS должно быть запущено:**

```bash
# Evolution API
docker ps | grep evolution-api  # UP

# Backend
pm2 status  # whatsapp-crm-api ONLINE

# PostgreSQL
systemctl status postgresql  # active (running)

# Redis
systemctl status redis-server  # active (running)
```

**Подключено:**

- ✅ WhatsApp 1 (CONNECTED)
- ✅ WhatsApp 2 (CONNECTED)
- ✅ WhatsApp 3 (CONNECTED)
- ✅ WhatsApp 4 (CONNECTED)

**Webhook настроен:**

```
http://188.241.217.76:3000/api/v1/whatsapp/webhook
```

---

**🎉 Все 4 WhatsApp подключены и работают!**

Любое сообщение на любой из 4 номеров → автоматически создается лид в системе.
