# 🚀 Быстрый деплой на VPS 188.241.217.76

## Вариант 1: Автоматический (рекомендуется)

```bash
cd backend
./DEPLOY_NOW.sh
```

Введите пароль: **Cococage_1234**

Готово! Backend задеплоен.

## Вариант 2: Вручную

### 1. Создать архив

```bash
cd backend
tar -czf /tmp/backend.tar.gz \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  .
```

### 2. Загрузить на VPS

```bash
scp /tmp/backend.tar.gz root@188.241.217.76:/tmp/
```

Password: **Cococage_1234**

### 3. На VPS установить

```bash
ssh root@188.241.217.76
# Password: Cococage_1234

# Распаковать
mkdir -p /var/www/whatsapp-crm
cd /var/www/whatsapp-crm
tar -xzf /tmp/backend.tar.gz

# Установить
npm install
npx prisma generate
npm run build
npx prisma migrate deploy

# Запустить
pm2 start dist/main.js --name whatsapp-crm-api -i 2
pm2 save
```

## Проверка

```bash
curl http://188.241.217.76:3000/api/v1
```

Должен работать! ✅

## После деплоя

1. Обновить .env на сервере
2. Установить Evolution API
3. Подключить 4 WhatsApp
4. Задеплоить фронтенд

См. **WHATSAPP_SETUP.md** для подключения WhatsApp.
