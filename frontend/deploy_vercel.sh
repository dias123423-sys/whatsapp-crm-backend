#!/bin/bash

echo "🚀 WhatsApp CRM - Vercel Deployment Script"
echo "=========================================="
echo ""

# Check if vercel is installed
if ! command -v vercel &> /dev/null; then
    echo "⚠️  Vercel CLI не установлен!"
    echo "Устанавливаю..."
    npm install -g vercel
fi

echo "✅ Vercel CLI готов"
echo ""

# Check if logged in
echo "🔐 Проверяю авторизацию..."
vercel whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo "Нужна авторизация в Vercel..."
    vercel login
fi

echo "✅ Авторизация OK"
echo ""

# Ensure we're in the right directory
cd "$(dirname "$0")"

echo "📦 Проверяю зависимости..."
if [ ! -d "node_modules" ]; then
    echo "Устанавливаю зависимости..."
    npm install
fi

echo "✅ Зависимости готовы"
echo ""

echo "🏗️  Собираю production build..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Ошибка сборки!"
    exit 1
fi

echo "✅ Сборка успешна!"
echo ""

echo "🚀 Деплою на Vercel..."
vercel --prod

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 ДЕПЛОЙ УСПЕШЕН!"
    echo ""
    echo "📱 Тестовые аккаунты:"
    echo "   Админ: admin@callcenter.com / admin123"
    echo "   Оператор: operator@callcenter.com / operator123"
    echo ""
    echo "🔗 Backend API: http://188.241.217.76:3000"
else
    echo ""
    echo "❌ Ошибка деплоя!"
    exit 1
fi
