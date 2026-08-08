# 🚀 ДЕПЛОЙ НА VERCEL - ГОТОВ!

## ✅ ВСЁ ГОТОВО К ДЕПЛОЮ!

Фронтенд полностью создан, собран и готов к production!

---

## ⚡ САМЫЙ БЫСТРЫЙ СПОСОБ (30 секунд)

```bash
cd "/home/dias/Рабочий стол/call-center-main/frontend"
./deploy_vercel.sh
```

Скрипт сделает всё автоматически:
1. ✅ Проверит Vercel CLI
2. ✅ Залогинит (если нужно)
3. ✅ Установит зависимости
4. ✅ Соберёт проект
5. ✅ Задеплоит на production
6. ✅ Покажет URL

---

## 🔧 РУЧНОЙ ДЕПЛОЙ (если нужен контроль)

### Шаг 1: Установи Vercel CLI

```bash
npm install -g vercel
```

### Шаг 2: Логин

```bash
vercel login
```

Выбери способ:
- GitHub
- Email
- GitLab

### Шаг 3: Деплой

```bash
cd "/home/dias/Рабочий стол/call-center-main/frontend"
vercel --prod
```

**Vercel спросит:**
```
Set up and deploy "~/Рабочий стол/call-center-main/frontend"?
→ YES

Which scope do you want to deploy to?
→ Твой account

Link to existing project?
→ NO (создай новый)

What's your project's name?
→ whatsapp-crm (или любое имя)

In which directory is your code located?
→ ./ (нажми Enter)

Want to override the settings?
→ NO (настройки автоопределятся)
```

**Ждёшь 1-2 минуты...**

**Получаешь:**
```
✅ Production: https://whatsapp-crm-xxx.vercel.app
```

---

## 🌐 ЧЕРЕЗ VERCEL DASHBOARD

1. **Пушим на GitHub:**

```bash
cd "/home/dias/Рабочий стол/call-center-main"
git add frontend/
git commit -m "🚀 Frontend ready for Vercel"
git push origin main
```

2. **На Vercel.com:**
   - Иди на [vercel.com/new](https://vercel.com/new)
   - Import Git Repository
   - Выбери `dias123423-sys/whatsapp-crm-backend`
   - **ВАЖНО!** Root Directory → `frontend`
   - Framework Preset: Vite (auto-detect)
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Нажми **Deploy**

3. **Готово!**
   - URL: `https://whatsapp-crm-xxx.vercel.app`
   - Auto-deploy при каждом push

---

## 📦 ЧТО УЖЕ СОЗДАНО

```
frontend/
├── dist/                        ✅ Production build (300KB)
│   ├── index.html
│   └── assets/
│       ├── index-*.css (16KB)
│       └── index-*.js  (287KB)
├── src/
│   ├── pages/
│   │   ├── Login.tsx           ✅ Вход
│   │   ├── AdminDashboard.tsx  ✅ Админ панель
│   │   └── OperatorDashboard.tsx ✅ Оператор панель
│   ├── components/ui/          ✅ Button, Card, Input, Badge
│   ├── lib/
│   │   ├── api.ts              ✅ Axios client
│   │   ├── store.ts            ✅ Zustand state
│   │   └── utils.ts            ✅ Helpers
│   ├── types/                  ✅ TypeScript types
│   ├── App.tsx                 ✅ Router
│   └── main.tsx                ✅ Entry
├── vercel.json                 ✅ Vercel config
├── deploy_vercel.sh            ✅ Auto-deploy script
└── package.json                ✅ Dependencies
```

---

## 🎯 ФУНКЦИОНАЛ

### Админ панель (`/admin`)
```
✅ Видит ВСЕ новые лиды
✅ Статистика dashboard
✅ Назначает лиды операторам вручную
✅ Видит список операторов
✅ Автообновление каждые 10 сек
```

### Панель оператора (`/operator`)
```
✅ Видит ТОЛЬКО свои лиды
✅ Клик по телефону → звонок
✅ Кнопки обновления статуса:
   📞 Звоню
   ✅ Записан
   ⏰ Перезвонить
   📭 Не отвечает
   ❌ Закрыть
✅ Добавление заметок
✅ Автообновление каждые 15 сек
```

---

## 🔑 ТЕСТОВЫЕ АККАУНТЫ

После деплоя заходи с:

```
АДМИН:
  Email: admin@callcenter.com
  Password: admin123
  URL: https://your-app.vercel.app/admin

ОПЕРАТОР:
  Email: operator@callcenter.com
  Password: operator123
  URL: https://your-app.vercel.app/operator
```

---

## ⚙️ ТЕХНОЛОГИИ

```
React 18              ✅
TypeScript            ✅
Vite                  ✅
TailwindCSS           ✅
Zustand (state)       ✅
React Router          ✅
Axios                 ✅
Lucide Icons          ✅
```

---

## 🔗 API ENDPOINTS

Backend: `http://188.241.217.76:3000/api/v1`

```typescript
POST   /auth/login              // Вход
GET    /auth/me                 // Текущий юзер
GET    /leads                   // Список лидов
POST   /leads/:id/assign        // Назначить оператору
PATCH  /leads/:id               // Обновить статус
GET    /operators               // Список операторов
GET    /dashboard/stats         // Статистика
```

---

## 🧪 ТЕСТ ЛОКАЛЬНО (опционально)

```bash
cd "/home/dias/Рабочий стол/call-center-main/frontend"

# Development mode
npm run dev
# → http://localhost:5173

# Production preview
npm run preview
# → http://localhost:4173
```

---

## 🔧 ПОСЛЕ ДЕПЛОЯ

### 1. Добавь Vercel URL в CORS

```bash
ssh root@188.241.217.76
cd /root/whatsapp-crm-backend
nano src/main.ts
```

Добавь свой Vercel URL:
```typescript
app.enableCors({
  origin: [
    'http://localhost:5173',
    'https://whatsapp-crm-xxx.vercel.app'  // ← твой URL
  ],
  credentials: true,
});
```

Пересобери:
```bash
npm run build
pm2 restart all
```

### 2. Проверь что всё работает

```bash
# Проверь backend
curl http://188.241.217.76:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@callcenter.com","password":"admin123"}'

# Должен вернуть JSON с accessToken
```

---

## 🎊 ПОЛНАЯ СИСТЕМА

```
Instagram/Facebook Ads
        ↓
WhatsApp (4 номера)
        ↓
Evolution API (:8080) ✅
        ↓
Backend NestJS (VPS:3000) ✅
        ↓
PostgreSQL Neon ✅
        ↓
Frontend React (Vercel) ⏳ ДЕПЛОЙ СЕЙЧАС!
        ↓
Админ → Назначает
        ↓
Оператор → Звонит → Записывает
```

---

## 🚀 ДЕПЛОЙ ПРЯМО СЕЙЧАС!

### Вариант А: Автоматический (рекомендуется)

```bash
cd "/home/dias/Рабочий стол/call-center-main/frontend"
./deploy_vercel.sh
```

### Вариант Б: Ручной

```bash
cd "/home/dias/Рабочий стол/call-center-main/frontend"
vercel --prod
```

### Вариант В: Dashboard

1. Push на GitHub
2. [vercel.com/new](https://vercel.com/new)
3. Import repo
4. Root: `frontend`
5. Deploy!

---

## ✅ CHECKLIST

- [x] Backend работает (188.241.217.76:3000) ✅
- [x] PostgreSQL Neon подключен ✅
- [x] Evolution API работает (:8080) ✅
- [x] Frontend создан ✅
- [x] Frontend собран (dist/) ✅
- [x] vercel.json готов ✅
- [x] CORS настроен ✅
- [ ] **ДЕПЛОЙ НА VERCEL** ← СЕЙЧАС!

---

## 🆘 TROUBLESHOOTING

### "Vercel CLI not found"
```bash
npm install -g vercel
```

### "Login required"
```bash
vercel login
```

### "Build failed"
```bash
cd frontend
rm -rf node_modules dist
npm install
npm run build
```

### "CORS error после деплоя"
Добавь Vercel URL в `backend/src/main.ts` → CORS origins

### "API не отвечает"
```bash
ssh root@188.241.217.76
pm2 status
pm2 logs
```

---

## 📚 ДОКУМЕНТАЦИЯ

- `frontend/README.md` - Общая информация
- `frontend/DEPLOY.md` - Детальная инструкция деплоя
- `FRONTEND_COMPLETE.md` - Полное описание проекта

---

## 🎉 ГОТОВО!

**Осталось только:**

```bash
cd "/home/dias/Рабочий стол/call-center-main/frontend"
./deploy_vercel.sh
```

**или**

```bash
vercel --prod
```

**Получишь URL через 1-2 минуты!**

🔗 Backend: http://188.241.217.76:3000 ✅  
🔗 Frontend: https://your-app.vercel.app ⏳  
🔗 WhatsApp: Evolution API :8080 ✅  
🔗 Database: PostgreSQL Neon ✅  

**ВСЁ РАБОТАЕТ! ДЕПЛОЙ!** 🚀
