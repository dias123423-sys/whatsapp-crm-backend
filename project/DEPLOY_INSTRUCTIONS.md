# 🚀 Инструкция по деплою на VPS 188.241.217.76

## 📋 Что уже настроено

✅ **База данных:** Neon PostgreSQL (внешняя, без локального контейнера)  
✅ **Backend .env:** все переменные заполнены  
✅ **Dashboard .env.local:** http://188.241.217.76:3001  
✅ **Docker Compose:** Evolution API + Backend  
✅ **Nginx:** reverse proxy для /api, /webhook, /socket.io  

---

## 1️⃣ Копировать проект на VPS

```bash
# С вашего компьютера
scp -r project/ root@188.241.217.76:/opt/callcenter/
```

Или через Git:
```bash
ssh root@188.241.217.76
cd /opt/callcenter
git clone <YOUR_REPO_URL> .
```

---

## 2️⃣ Запустить деплой скрипт на VPS

```bash
ssh root@188.241.217.76
cd /opt/callcenter
chmod +x deploy/deploy.sh
bash deploy/deploy.sh
```

**Скрипт выполнит:**
- Установка Docker + Docker Compose
- Установка nginx
- Запуск `docker compose up -d --build`
- Настройка nginx reverse proxy
- Открытие портов в UFW firewall

---

## 3️⃣ Проверка

### Backend
```bash
curl http://188.241.217.76:3001/health
# → {"status":"ok","uptime":...}
```

### Evolution API
```bash
curl http://188.241.217.76:8080/instance/fetchInstances \
  -H "apikey: 429683C4C977415CAAFCCE10F7D57E11"
```

---

## 4️⃣ Dashboard (локальный запуск)

На вашем компьютере:

```bash
cd apps/dashboard
npm install
npm run dev
```

Открыть: **http://localhost:3000**  
Логин: `admin` / `Cocoage_1234$`

Dashboard подключится к **http://188.241.217.76:3001** (уже прописано в `.env.local`).

---

## 5️⃣ Сканирование QR кодов

1. В Dashboard открыть **WhatsApp панель**
2. Нажать "QR" на WA1, WA2, WA3, WA4
3. Сканировать каждый QR через WhatsApp → Связанные устройства → Привязать устройство

После сканирования сессии сохраняются в Docker volume `evolution_data` — при рестарте QR не нужен.

---

## 🔍 Логи и управление

### Логи контейнеров
```bash
cd /opt/callcenter
docker compose logs -f backend
docker compose logs -f evolution-api
```

### Рестарт backend (без потери QR сессий)
```bash
docker compose restart backend
```

### Обновление кода (zero-downtime)
```bash
cd /opt/callcenter
git pull
bash deploy/update.sh
```

### Полный стоп
```bash
docker compose down
```

### Полный стоп + удаление volumes (⚠️ потеряете QR сессии)
```bash
docker compose down -v
```

---

## 📁 Структура на VPS

```
/opt/callcenter/
├── backend/
│   ├── .env                  ← заполнен всеми переменными
│   ├── src/
│   └── Dockerfile
├── apps/dashboard/           ← НЕ запускается на VPS (только локально)
├── docker-compose.yml        ← Evolution API + Backend
├── deploy/
│   ├── nginx.conf
│   ├── deploy.sh
│   └── update.sh
└── DEPLOY_INSTRUCTIONS.md    ← этот файл
```

---

## 🌐 URL endpoints

| Сервис | URL | Порт |
|--------|-----|------|
| Backend API | http://188.241.217.76:3001/api | 3001 |
| Backend Health | http://188.241.217.76:3001/health | 3001 |
| Socket.IO | ws://188.241.217.76:3001/socket.io | 3001 |
| Evolution API | http://188.241.217.76:8080 | 8080 |
| Dashboard (локально) | http://localhost:3000 | 3000 |

---

## 🔐 Учётные данные

### Dashboard login
- **Username:** `admin`
- **Password:** `Cocoage_1234$`

### Evolution API key
- **apikey:** `429683C4C977415CAAFCCE10F7D57E11`

### Neon Database
- Уже прописан в `backend/.env`
- Connection pooler, SSL required

---

## ⚙️ Переменные окружения

### backend/.env (уже заполнен)
```bash
DATABASE_URL=postgresql://neondb_owner:...@ep-withered-pond-aythlva6-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
JWT_SECRET=ij6CETIv4NqBNQzKjKbiVzlz2WD6c9keUjewSR872OpBnTAS
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Cocoage_1234$
FRONTEND_URL=http://188.241.217.76:3000,http://188.241.217.76,http://172.16.0.2:3000
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11
WEBHOOK_URL=http://172.16.0.2:3001/webhook/evolution
```

### apps/dashboard/.env.local (уже заполнен)
```bash
NEXT_PUBLIC_API_URL=http://188.241.217.76:3001
NEXT_PUBLIC_SOCKET_URL=http://188.241.217.76:3001
```

---

## 🛠️ Troubleshooting

### Backend не запускается
```bash
docker compose logs backend
# Проверить DATABASE_URL, Prisma миграции
```

### Evolution API не создаёт инстансы
```bash
docker compose logs evolution-api
# Проверить DATABASE_CONNECTION_URI в docker-compose.yml
```

### Dashboard не подключается к backend
```bash
# В apps/dashboard/.env.local проверить:
NEXT_PUBLIC_API_URL=http://188.241.217.76:3001
```

### QR код не появляется
1. Проверить что Evolution API запущен: `curl http://188.241.217.76:8080/instance/fetchInstances -H "apikey: 429683C4C977415CAAFCCE10F7D57E11"`
2. Логи backend: `docker compose logs backend | grep Evolution`
3. Рестарт: `docker compose restart evolution-api backend`

### Socket.IO не работает
- Убедиться что nginx правильно проксирует `/socket.io/` (WebSocket upgrade)
- Проверить CORS в `backend/src/index.ts` — должен включать `188.241.217.76`

---

## 📊 Мониторинг

### Проверка здоровья
```bash
# Backend
curl http://188.241.217.76:3001/health

# Evolution API (требует apikey)
curl -H "apikey: 429683C4C977415CAAFCCE10F7D57E11" \
  http://188.241.217.76:8080/instance/fetchInstances
```

### Использование ресурсов
```bash
docker stats
```

---

## 🚨 Важные замечания

1. **Neon connection limit:** Pooler поддерживает до 1000 одновременных подключений. Backend + Evolution API в сумме < 100 — всё ок.

2. **Evolution API sessions:** Сохраняются в Docker volume `evolution_data`. При `docker compose down` volume сохраняется. При `docker compose down -v` — удаляется (нужно сканировать QR заново).

3. **SSL/HTTPS:** Сейчас всё через HTTP. Для HTTPS:
   - Получить домен (или использовать IP)
   - Установить certbot: `sudo apt install certbot python3-certbot-nginx`
   - Получить сертификат: `sudo certbot --nginx -d yourdomain.com`

4. **Firewall:** UFW разрешает порты 22 (SSH), 80 (HTTP), 3000 (dashboard dev). Если нужен HTTPS — порт 443 откроется автоматически при certbot.

---

## ✅ Готово!

После выполнения всех шагов у вас работает:
- ✅ Backend на http://188.241.217.76:3001
- ✅ Evolution API на http://188.241.217.76:8080
- ✅ Dashboard локально на http://localhost:3000
- ✅ 4 WhatsApp аккаунта (WA1-WA4) готовы к сканированию QR
