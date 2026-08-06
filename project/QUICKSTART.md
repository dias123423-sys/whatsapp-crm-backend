# ⚡ Quick Start — 5 минут до запуска

## 📦 Что уже готово
- ✅ Все `.env` файлы заполнены
- ✅ Neon PostgreSQL подключена
- ✅ Docker Compose настроен
- ✅ Nginx конфиг готов

---

## 🚀 Шаг 1: Копируем на VPS

```bash
# С вашего компьютера
scp -r project/ root@188.241.217.76:/opt/callcenter/
```

---

## 🚀 Шаг 2: Запускаем на VPS

```bash
ssh root@188.241.217.76

cd /opt/callcenter
chmod +x deploy/deploy.sh
bash deploy/deploy.sh
```

**Что произойдёт:**
1. Установится Docker + nginx
2. Запустится `docker compose up -d`
3. Backend будет на порту 3001
4. Evolution API на порту 8080

**Ждём ~2 минуты** пока всё поднимется.

---

## 🚀 Шаг 3: Проверяем

```bash
# Проверка backend
curl http://188.241.217.76:3001/health

# Должно вернуть:
# {"status":"ok","uptime":123,"timestamp":"..."}
```

---

## 🚀 Шаг 4: Запускаем Dashboard локально

**На вашем компьютере:**

```bash
cd apps/dashboard
npm install
npm run dev
```

Откроется **http://localhost:3000**

**Логин:**
- Username: `admin`
- Password: `Cocoage_1234$`

---

## 🚀 Шаг 5: Сканируем QR коды

1. В Dashboard → **WhatsApp панель** справа
2. Нажимаем **QR** на WA1
3. Сканируем через WhatsApp → **Связанные устройства** → **Привязать устройство**
4. Повторяем для WA2, WA3, WA4

**Готово!** Теперь все сообщения будут автоматически обрабатываться.

---

## 🧪 Тестирование

Отправьте сообщение на любой из подключённых WhatsApp:

```
Клиент: Айбек
Телефон: +77011234567
Дата: 12 июля
Время: 14:00
Запись создана ✅
```

Или:

```
Записала Алину на завтра в 16:00
Телефон: +77071234567
```

Dashboard обновится **в реальном времени** — новая запись появится сразу.

---

## 📊 Мониторинг

### Логи
```bash
# На VPS
docker compose logs -f backend
docker compose logs -f evolution-api
```

### Статус
```bash
docker compose ps
```

### Рестарт
```bash
docker compose restart backend
```

---

## 🛑 Остановка

```bash
# Стоп без удаления данных
docker compose down

# Стоп + удаление volumes (⚠️ потеряете QR сессии)
docker compose down -v
```

---

## 🔄 Обновление кода

```bash
cd /opt/callcenter
git pull
bash deploy/update.sh
```

---

## 📞 Проблемы?

### Backend не запускается
```bash
docker compose logs backend
# Проверить DATABASE_URL, запустить миграции:
docker compose exec backend npx prisma migrate deploy --schema=prisma/schema.prisma
```

### QR не появляется
```bash
docker compose restart evolution-api
docker compose logs evolution-api
```

### Dashboard не подключается
```bash
# Проверить apps/dashboard/.env.local:
# NEXT_PUBLIC_API_URL=http://188.241.217.76:3001
```

---

## 🎯 Полная документация

- **README.md** — полное описание проекта
- **DEPLOY_INSTRUCTIONS.md** — пошаговая инструкция с troubleshooting

---

## ✅ Checklist

- [ ] Проект скопирован на VPS
- [ ] `deploy.sh` выполнен успешно
- [ ] `curl http://188.241.217.76:3001/health` возвращает OK
- [ ] Dashboard запущен локально (npm run dev)
- [ ] Залогинились: admin / Cocoage_1234$
- [ ] Отсканировали QR для WA1, WA2, WA3, WA4
- [ ] Тестовое сообщение создало запись в Dashboard

**Всё работает? Отлично! 🎉**
