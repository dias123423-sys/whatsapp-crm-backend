# 🚀 Деплой на Vercel

## ✅ Готово к деплою!

Фронтенд собран успешно! Папка `dist/` готова к деплою.

---

## Вариант 1: Быстрый деплой через CLI (Рекомендуется)

### 1. Установи Vercel CLI

```bash
npm install -g vercel
```

### 2. Залогинься

```bash
vercel login
```

Введи email или используй GitHub/GitLab.

### 3. Деплой

```bash
cd "/home/dias/Рабочий стол/call-center-main/frontend"
vercel --prod
```

Vercel автоматически:
- Обнаружит Vite проект
- Соберет билд
- Задеплоит на production
- Даст URL типа: `https://your-app.vercel.app`

---

## Вариант 2: Через GitHub + Vercel Dashboard

### 1. Пушим на GitHub

```bash
cd "/home/dias/Рабочий стол/call-center-main"
git add frontend/
git commit -m "✨ Frontend ready for Vercel deployment"
git push
```

### 2. Подключаем Vercel

1. Заходи на [vercel.com](https://vercel.com)
2. Нажми **"Add New Project"**
3. Импортируй репозиторий с GitHub
4. **ВАЖНО**: Настрой **Root Directory** = `frontend`
5. Framework Preset: **Vite**
6. Build Command: `npm run build`
7. Output Directory: `dist`
8. Нажми **Deploy**!

### 3. Переменные окружения (опционально)

В Vercel Dashboard → Settings → Environment Variables:

```
VITE_API_URL = http://188.241.217.76:3000/api/v1
```

---

## Вариант 3: Ручной деплой (уже собран)

Папка `dist/` уже готова! Можешь:

1. Загрузить в Vercel через drag-and-drop:
   - Зайди на [vercel.com/new](https://vercel.com/new)
   - Перетащи папку `frontend/dist/`

2. Или использовать любой хостинг (Netlify, Cloudflare Pages, etc.)

---

## 🧪 Тест локально

```bash
cd "/home/dias/Рабочий стол/call-center-main/frontend"
npm run preview
```

Откроется на `http://localhost:4173` - это production build!

---

## 📱 Тестовые данные

После деплоя заходи:

- **Админ**: admin@callcenter.com / admin123
- **Оператор**: operator@callcenter.com / operator123

---

## ⚙️ Что уже настроено

✅ CORS на бэкенде (188.241.217.76:3000)  
✅ API подключен к VPS  
✅ SPA routing (vercel.json)  
✅ Production build  
✅ Environment variables  

---

## 🔧 Troubleshooting

### CORS ошибки

Проверь, что бэкенд разрешает твой Vercel домен:

```typescript
// backend/src/main.ts
app.enableCors({
  origin: ['http://localhost:5173', 'https://your-app.vercel.app'],
  credentials: true,
});
```

### 404 при рефреше страницы

Уже исправлено в `vercel.json` - все запросы идут на `index.html`.

### API не отвечает

Проверь что бэкенд работает:

```bash
curl http://188.241.217.76:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@callcenter.com","password":"admin123"}'
```

---

## 🎉 Готово!

После деплоя получишь URL типа:
```
https://whatsapp-crm-xxx.vercel.app
```

Админ панель: `/admin`  
Оператор панель: `/operator`

---

**Backend:** http://188.241.217.76:3000 ✅  
**Frontend:** Vercel ⏳  
**WhatsApp:** Evolution API :8080 ✅  
