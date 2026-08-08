# ✅ ФРОНТЕНД ГОТОВ!

## 🎉 Что создано

### Структура проекта
```
frontend/
├── dist/                    # ✅ Production build (300KB)
├── src/
│   ├── pages/
│   │   ├── Login.tsx       # ✅ Страница входа
│   │   ├── AdminDashboard.tsx  # ✅ Админ панель (диспетчер)
│   │   └── OperatorDashboard.tsx  # ✅ Панель оператора
│   ├── components/ui/      # ✅ Button, Card, Input, Badge
│   ├── lib/
│   │   ├── api.ts          # ✅ API client (axios)
│   │   ├── store.ts        # ✅ State management (Zustand)
│   │   └── utils.ts        # ✅ Utilities
│   ├── types/index.ts      # ✅ TypeScript types
│   ├── App.tsx             # ✅ Router + Protected routes
│   ├── main.tsx            # ✅ Entry point
│   └── index.css           # ✅ Tailwind styles
├── package.json            # ✅ Dependencies
├── vite.config.ts          # ✅ Vite config + proxy
├── vercel.json             # ✅ Vercel deployment config
└── DEPLOY.md               # ✅ Инструкция по деплою
```

---

## 🚀 ДЕПЛОЙ НА VERCEL (3 варианта)

### ⚡ Вариант 1: CLI (Самый быстрый)

```bash
# 1. Установи Vercel CLI
npm install -g vercel

# 2. Залогинься
vercel login

# 3. Деплой!
cd "/home/dias/Рабочий стол/call-center-main/frontend"
vercel --prod
```

✅ **Готово!** Получишь URL типа: `https://whatsapp-crm-xxx.vercel.app`

---

### 🔗 Вариант 2: GitHub Integration

```bash
# 1. Пушим на GitHub
cd "/home/dias/Рабочий стол/call-center-main"
git add frontend/
git commit -m "🚀 Frontend ready"
git push
```

```
# 2. На vercel.com
1. New Project
2. Import от dias123423-sys/whatsapp-crm-backend
3. Root Directory: frontend
4. Framework: Vite
5. Deploy!
```

✅ **Автодеплой при каждом push!**

---

### 📁 Вариант 3: Drag & Drop

1. Иди на [vercel.com/new](https://vercel.com/new)
2. Перетащи папку `frontend/dist/`
3. Готово!

---

## 🎯 Функционал

### 👨‍💼 Админ панель (`/admin`)
- ✅ Видит ВСЕ новые лиды из WhatsApp
- ✅ Статистика: всего/новые/записано/конверсия
- ✅ Список операторов с загрузкой
- ✅ Назначение лида оператору вручную
- ✅ Автообновление каждые 10 секунд

### 👨‍💻 Панель оператора (`/operator`)
- ✅ Видит ТОЛЬКО свои назначенные лиды
- ✅ Клик на телефон → звонок
- ✅ Обновление статуса:
  - 📞 Звоню
  - ✅ Записан
  - ⏰ Перезвонить
  - 📭 Не отвечает
  - ❌ Закрыть
- ✅ Добавление заметок
- ✅ Автообновление каждые 15 секунд

### 🔐 Авторизация
- ✅ JWT токены
- ✅ Protected routes
- ✅ Auto redirect по роли
- ✅ Logout

---

## 🧪 Тестовые аккаунты

```
Админ:
  Email: admin@callcenter.com
  Password: admin123

Оператор:
  Email: operator@callcenter.com
  Password: operator123
```

---

## ⚙️ Технологии

- **React 18** + **TypeScript**
- **Vite** (быстрая сборка)
- **TailwindCSS** (стили)
- **Zustand** (state)
- **React Router** (роутинг)
- **Axios** (API)
- **Lucide Icons** (иконки)
- **date-fns** (даты)

---

## 🔗 API Endpoints используются

```typescript
POST   /api/v1/auth/login       // Вход
GET    /api/v1/auth/me          // Текущий юзер
GET    /api/v1/leads            // Все лиды
POST   /api/v1/leads/:id/assign // Назначить оператору
PATCH  /api/v1/leads/:id        // Обновить статус
GET    /api/v1/operators        // Список операторов
GET    /api/v1/dashboard/stats  // Статистика
```

---

## 🧪 Тест локально

```bash
cd "/home/dias/Рабочий стол/call-center-main/frontend"

# Development
npm run dev
# → http://localhost:5173

# Production preview
npm run preview
# → http://localhost:4173
```

---

## 📊 Размеры билда

```
dist/index.html                   0.46 kB
dist/assets/index-[hash].css     16.16 kB (gzip: 3.80 kB)
dist/assets/index-[hash].js     286.74 kB (gzip: 92.63 kB)
```

✅ **Оптимизировано для production!**

---

## 🔧 Environment Variables

Уже настроено в `.env` и `.env.production`:

```env
VITE_API_URL=http://188.241.217.76:3000/api/v1
```

На Vercel добавь в Settings → Environment Variables (опционально).

---

## ✅ Checklist перед деплоем

- [x] Backend запущен на VPS (188.241.217.76:3000) ✅
- [x] CORS настроен на бэкенде ✅
- [x] PostgreSQL Neon подключен ✅
- [x] Seed data загружен ✅
- [x] Evolution API работает (:8080) ✅
- [x] Frontend собран (`npm run build`) ✅
- [x] Тесты входа работают ✅

---

## 🎊 СЛЕДУЮЩИЙ ШАГ

```bash
cd "/home/dias/Рабочий стол/call-center-main/frontend"
vercel --prod
```

**ИЛИ**

Читай `frontend/DEPLOY.md` для других вариантов!

---

## 🆘 Troubleshooting

### CORS ошибка после деплоя

```bash
ssh root@188.241.217.76
cd /root/whatsapp-crm-backend
nano src/main.ts
```

Добавь Vercel URL в CORS:
```typescript
app.enableCors({
  origin: ['http://localhost:5173', 'https://your-app.vercel.app'],
  credentials: true,
});
```

```bash
npm run build
pm2 restart all
```

### API не отвечает

Проверь бэкенд:
```bash
curl http://188.241.217.76:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@callcenter.com","password":"admin123"}'
```

Должен вернуть `{ "accessToken": "..." }`

---

## 🎯 Полный флоу

```
WhatsApp (4 номера)
    ↓
Evolution API (:8080)
    ↓
Backend NestJS (VPS:3000)
    ↓
PostgreSQL Neon
    ↓
Frontend React (Vercel)
    ↓
Админ → Назначает лид оператору
    ↓
Оператор → Звонит с телефона → Обновляет статус
```

---

## 🎉 ВСЁ ГОТОВО!

**Backend:** ✅ http://188.241.217.76:3000  
**Frontend:** ⏳ Задеплой на Vercel  
**WhatsApp:** ✅ Evolution API :8080  
**Database:** ✅ PostgreSQL Neon  

**Осталось только:**
```bash
vercel --prod
```

---

📝 **Детальная инструкция:** `frontend/DEPLOY.md`  
📦 **Production build:** `frontend/dist/`  
🔗 **Repo:** https://github.com/dias123423-sys/whatsapp-crm-backend
