# 📤 Загрузка кода в GitHub

## Шаг 1: Создать репозиторий на GitHub

1. Открыть https://github.com/new
2. Repository name: **whatsapp-crm-backend**
3. Description: **WhatsApp Lead CRM Backend - NestJS + Evolution API**
4. Public или Private (на выбор)
5. НЕ создавать README, .gitignore (уже есть)
6. Нажать **Create repository**

## Шаг 2: Запушить код

После создания репозитория:

```bash
cd backend

# Добавить remote
git remote remove origin
git remote add origin https://YOUR_GITHUB_TOKEN@github.com/dias123423-sys/whatsapp-crm-backend.git

# Добавить все файлы
git add .
git commit -m "Initial commit: WhatsApp Lead CRM Backend"

# Запушить
git push -u origin main --force
```

## Готово!

Код загружен на GitHub: https://github.com/dias123423-sys/whatsapp-crm-backend

## Клонировать на VPS

```bash
ssh root@188.241.217.76

cd /var/www
git clone https://YOUR_GITHUB_TOKEN@github.com/dias123423-sys/whatsapp-crm-backend.git whatsapp-crm

cd whatsapp-crm
npm install
npx prisma generate
npm run build
npx prisma migrate deploy

pm2 start dist/main.js --name whatsapp-crm-api -i 2
pm2 save
```

Готово! Backend работает на VPS.
