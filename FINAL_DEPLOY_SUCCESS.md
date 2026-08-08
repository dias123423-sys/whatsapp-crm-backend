# 🎉 BACKEND DEPLOYMENT SUCCESSFUL!

## ✅ Что задеплоено

**Backend API успешно задеплоен на VPS 188.241.217.76!**

- ✅ NestJS приложение собрано и запущено
- ✅ База данных создана и мигрирована
- ✅ Seed данные загружены (admin + 3 оператора + 5 процедур)
- ✅ PM2 настроен для auto-restart
- ✅ Приложение работает в кластере (2 процесса)

---

## 🚀 Как проверить работу

### 1. Проверить API

```bash
curl http://188.241.217.76:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@callcenter.com","password":"admin123"}'
```

**Ожидаемый ответ:**
```json
{
  "access_token": "eyJhbGc...",
  "user": {
    "id": "...",
    "email": "admin@callcenter.com",
    "name": "Admin",
    "role": "ADMIN"
  }
}
```

### 2. Swagger документация

Открыть в браузере:
```
http://188.241.217.76:3000/api/docs
```

---

## 🐳 Осталось: Запустить Docker контейнеры

### Подключиться к VPS:

```bash
ssh root@188.241.217.76
# Password: Cocoage_1234$
```

### Запустить Evolution API:

```bash
docker run -d \
  --name evolution-api \
  --restart unless-stopped \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY="evolution-key-2026-secure" \
  -e SERVER_URL="http://188.241.217.76:8080" \
  atendai/evolution-api:latest
```

### Запустить Redis:

```bash
docker run -d \
  --name redis \
  --restart unless-stopped \
  -p 6379:6379 \
  redis:alpine
```

### Проверить контейнеры:

```bash
docker ps
```

**Должны быть:**
- evolution-api (порт 8080)
- redis (порт 6379)

---

## 📱 Подключение WhatsApp

После запуска Evolution API:

```bash
# Получить список instances
curl http://188.241.217.76:8080/instance/fetchInstances \
  -H "apikey: evolution-key-2026-secure"

# Создать instance
curl -X POST http://188.241.217.76:8080/instance/create \
  -H "apikey: evolution-key-2026-secure" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "whatsapp-1",
    "qrcode": true,
    "webhook": "http://188.241.217.76:3000/api/v1/whatsapp/webhook"
  }'
```

Получите QR-код и отсканируйте через WhatsApp.

Повторить для `whatsapp-2`, `whatsapp-3`, `whatsapp-4`.

---

## 📊 Мониторинг

### Логи приложения:

```bash
ssh root@188.241.217.76
pm2 logs whatsapp-crm-api
```

### Статус:

```bash
pm2 status
```

### Рестарт:

```bash
pm2 restart whatsapp-crm-api
```

### Остановка:

```bash
pm2 stop whatsapp-crm-api
```

---

## 🔐 Учетные данные

### Backend API
- **URL:** http://188.241.217.76:3000/api/v1
- **Admin:** admin@callcenter.com / admin123
- **Operator 1:** aizhan@callcenter.com / operator123
- **Operator 2:** maria@callcenter.com / operator123
- **Operator 3:** olga@callcenter.com / operator123

### VPS
- **IP:** 188.241.217.76
- **User:** root
- **Password:** Cocoage_1234$

### Database
- **Neon PostgreSQL** (cloud)
- **URL:** postgresql://neondb_owner:***@ep-withered-glitter...

### Evolution API
- **URL:** http://188.241.217.76:8080
- **API Key:** evolution-key-2026-secure

---

## 🎯 Следующие шаги

1. ✅ ~~Backend задеплоен~~
2. ✅ ~~База данных создана и заполнена~~
3. 🔲 Запустить Evolution API (см. выше)
4. 🔲 Запустить Redis (см. выше)
5. 🔲 Подключить 4 WhatsApp номера
6. 🔲 Задеплоить Frontend на Vercel
7. 🔲 Протестировать отправку тестового сообщения в WhatsApp
8. 🔲 Проверить, что лид создается в админке

---

## 🏗️ Архитектура (Финальная)

```
Instagram/Facebook → WhatsApp → Evolution API → Backend NestJS → PostgreSQL
                                      ↓
                                  Webhook
                                      ↓
                            100% Lead Capture
                                      ↓
                                  АДМИНКА
                                      ↓
                        Админ распределяет лиды
                                      ↓
                                 ОПЕРАТОРЫ
                                      ↓
                            Звонят и записывают
```

---

## ✅ Проверить работу сейчас

```bash
# 1. API отвечает
curl http://188.241.217.76:3000/api/v1

# 2. Login работает
curl -X POST http://188.241.217.76:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@callcenter.com","password":"admin123"}'

# 3. PM2 статус
ssh root@188.241.217.76 'pm2 list'
```

---

**🎉 Backend полностью задеплоен и работает!**

**Для запуска Evolution API и Redis - выполните команды выше через SSH.**
