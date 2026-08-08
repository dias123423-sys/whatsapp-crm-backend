# 🚀 Деплой на VPS сервер 188.241.217.76

## Информация о сервере

- **IP:** 188.241.217.76
- **Local IP:** 172.16.0.2
- **Password:** Cococage_1234
- **Git:** Доступ есть

## 📋 Перед деплоем

### 1. Проверить доступ к серверу

```bash
ssh root@188.241.217.76
# Password: Cococage_1234
```

Если подключились ✅ - можно продолжать.

### 2. Обновить настройки

Открыть `deploy/production.env` и изменить:

```env
# JWT Secret - ОБЯЗАТЕЛЬНО изменить!
JWT_SECRET=your-super-secret-random-string-here

# Evolution API - указать ваш URL
EVOLUTION_API_URL=http://188.241.217.76:8080
EVOLUTION_API_KEY=your-evolution-api-key

# CORS - указать URL фронтенда
CORS_ORIGIN=https://admin.yourdomain.com,https://operator.yourdomain.com
```

### 3. Обновить домен (опционально)

Открыть `deploy/deploy.sh` и изменить:

```bash
DOMAIN="api.yourdomain.com"  # Ваш домен или IP
```

## 🚀 Автоматический деплой

### Вариант 1: Через скрипт (рекомендуется)

```bash
cd backend/deploy
./deploy.sh
```

Скрипт автоматически:
- ✅ Установит все зависимости на сервер
- ✅ Настроит PostgreSQL
- ✅ Настроит Redis
- ✅ Загрузит код
- ✅ Соберет приложение
- ✅ Запустит через PM2
- ✅ Настроит Nginx

**Время:** ~10-15 минут

### Вариант 2: Ручной деплой

Если скрипт не работает, следуйте шагам ниже.

## 🔧 Ручной деплой (пошагово)

### Шаг 1: Подключиться к серверу

```bash
ssh root@188.241.217.76
```

### Шаг 2: Установить зависимости

```bash
# Обновить систему
apt update && apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PostgreSQL
apt install -y postgresql postgresql-contrib

# Redis
apt install -y redis-server

# Nginx
apt install -y nginx

# PM2
npm install -g pm2

# Git (если нужно)
apt install -y git
```

### Шаг 3: Создать базу данных

```bash
# Запустить PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Создать базу
sudo -u postgres psql << EOF
CREATE DATABASE whatsapp_lead_crm;
ALTER USER postgres WITH PASSWORD 'Cococage_1234';
EOF
```

### Шаг 4: Загрузить код

**С локальной машины:**

```bash
# Из папки backend
cd ~/Рабочий\ стол/call-center-main/backend

# Создать архив
tar -czf /tmp/backend.tar.gz \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  src/ prisma/ package*.json tsconfig.json nest-cli.json

# Загрузить на сервер
scp /tmp/backend.tar.gz root@188.241.217.76:/var/www/
```

**На сервере:**

```bash
# Создать папку
mkdir -p /var/www/whatsapp-crm
cd /var/www/whatsapp-crm

# Распаковать
tar -xzf /var/www/backend.tar.gz
rm /var/www/backend.tar.gz
```

### Шаг 5: Настроить .env

**На сервере:**

```bash
cd /var/www/whatsapp-crm

cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://postgres:Cococage_1234@localhost:5432/whatsapp_lead_crm"
REDIS_HOST=localhost
JWT_SECRET=change-this-to-random-string
EVOLUTION_API_URL=http://188.241.217.76:8080
EVOLUTION_API_KEY=your-key
CORS_ORIGIN=http://188.241.217.76:5173,http://188.241.217.76:5174
EOF

# Отредактировать
nano .env
```

### Шаг 6: Установить и собрать

```bash
cd /var/www/whatsapp-crm

# Установить зависимости
npm ci --only=production

# Генерировать Prisma
npx prisma generate

# Собрать приложение
npm run build

# Применить миграции
npx prisma migrate deploy

# Заполнить тестовыми данными
npx prisma db seed
```

### Шаг 7: Запустить через PM2

```bash
cd /var/www/whatsapp-crm

# Создать PM2 config
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'whatsapp-crm-api',
    script: './dist/main.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
    autorestart: true,
  }]
};
EOF

# Запустить
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Шаг 8: Настроить Nginx

```bash
cat > /etc/nginx/sites-available/whatsapp-crm << 'EOF'
server {
    listen 80;
    server_name 188.241.217.76;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# Активировать
ln -s /etc/nginx/sites-available/whatsapp-crm /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### Шаг 9: Настроить Firewall

```bash
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw allow 3000  # Backend (временно для тестов)
ufw enable
```

## ✅ Проверка работы

### 1. Проверить PM2

```bash
pm2 status
pm2 logs whatsapp-crm-api
```

### 2. Проверить API

```bash
curl http://188.241.217.76:3000/api/v1
```

Должен вернуть 404 - это нормально!

### 3. Проверить логин

```bash
curl -X POST http://188.241.217.76:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@callcenter.com",
    "password": "admin123"
  }'
```

Должен вернуть token ✅

### 4. Открыть Swagger

Откройте в браузере:

```
http://188.241.217.76:3000/api/docs
```

## 🔄 Обновление кода

После изменений в коде:

```bash
# На локальной машине
cd backend
tar -czf /tmp/backend-update.tar.gz src/
scp /tmp/backend-update.tar.gz root@188.241.217.76:/var/www/whatsapp-crm/

# На сервере
cd /var/www/whatsapp-crm
tar -xzf backend-update.tar.gz
npm run build
pm2 restart whatsapp-crm-api
```

## 🐛 Troubleshooting

### Backend не запускается

```bash
# Проверить логи
pm2 logs whatsapp-crm-api

# Проверить .env
cat /var/www/whatsapp-crm/.env

# Проверить PostgreSQL
systemctl status postgresql
sudo -u postgres psql -c "\l"
```

### База данных недоступна

```bash
# Перезапустить PostgreSQL
systemctl restart postgresql

# Проверить подключение
psql -U postgres -d whatsapp_lead_crm
```

### Redis недоступен

```bash
# Перезапустить Redis
systemctl restart redis-server

# Проверить
redis-cli ping  # должен вернуть PONG
```

### Nginx не работает

```bash
# Проверить конфиг
nginx -t

# Перезапустить
systemctl restart nginx

# Проверить логи
tail -f /var/log/nginx/error.log
```

## 📊 Мониторинг

### Логи PM2

```bash
pm2 logs whatsapp-crm-api --lines 100
```

### Статус приложения

```bash
pm2 status
pm2 monit
```

### Использование ресурсов

```bash
htop
df -h
free -h
```

## 🔐 Безопасность

### Изменить пароль PostgreSQL

```bash
sudo -u postgres psql
ALTER USER postgres WITH PASSWORD 'new-strong-password';
\q

# Обновить в .env
nano /var/www/whatsapp-crm/.env
```

### Изменить JWT_SECRET

```bash
# Сгенерировать случайную строку
openssl rand -base64 32

# Обновить в .env
nano /var/www/whatsapp-crm/.env

# Перезапустить
pm2 restart whatsapp-crm-api
```

## 🌐 Настройка домена (опционально)

### 1. Привязать домен к IP

В вашем DNS провайдере создайте A-запись:

```
api.yourdomain.com  →  188.241.217.76
```

### 2. Обновить Nginx

```bash
nano /etc/nginx/sites-available/whatsapp-crm
# Изменить server_name на ваш домен
```

### 3. Установить SSL

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d api.yourdomain.com
```

## 📞 Контакты

После деплоя:
- API: http://188.241.217.76:3000/api/v1
- Swagger: http://188.241.217.76:3000/api/docs
- Admin: admin@callcenter.com / admin123

---

**Готово! Backend работает на production сервере! 🎉**
