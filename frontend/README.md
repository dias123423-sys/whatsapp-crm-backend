# WhatsApp Lead CRM - Frontend

React + TypeScript + Vite приложение для управления WhatsApp лидами.

## Деплой на Vercel

### Быстрый деплой

```bash
npm install -g vercel
cd frontend
npm install
vercel --prod
```

### Через GitHub

1. Пушим на GitHub:
```bash
git add .
git commit -m "Frontend ready for Vercel"
git push
```

2. Заходим на [vercel.com](https://vercel.com)
3. Импортируем репозиторий
4. Выбираем папку `frontend` как root directory
5. Deploy!

## Локальная разработка

```bash
npm install
npm run dev
```

Откроется на http://localhost:5173

## Переменные окружения

Создай `.env`:
```
VITE_API_URL=http://188.241.217.76:3000/api/v1
```

## Тестовые данные

- **Админ**: admin@callcenter.com / admin123
- **Оператор**: operator@callcenter.com / operator123

## Архитектура

- **Админ панель**: Видит все новые лиды, назначает операторам
- **Оператор панель**: Видит только свои лиды, обновляет статусы
- **API**: Подключается к NestJS бэкенду на VPS

## Технологии

- React 18
- TypeScript
- Vite
- TailwindCSS
- Zustand (state)
- React Router
- Axios
- Lucide Icons
