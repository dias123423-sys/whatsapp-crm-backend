#!/bin/bash
set -e

SERVER="188.241.217.76"
USER="root"
PASSWORD="Cococage_1234"

echo "🚀 Deploying WhatsApp CRM to ${SERVER}..."

sshpass -p "${PASSWORD}" ssh -o StrictHostKeyChecking=no ${USER}@${SERVER} bash << 'ENDSSH'
set -e

cd /var/www

if [ -d "whatsapp-crm" ]; then
    cd whatsapp-crm
    git pull origin main
else
    git clone https://github.com/dias123423-sys/whatsapp-crm-backend.git whatsapp-crm
    cd whatsapp-crm
fi

cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://neondb_owner:npg_mWPj7aoxjm7w@ep-quiet-wind-a2aomkh4.eu-central-1.aws.neon.tech/neondb?sslmode=require"
JWT_SECRET=whatsapp-crm-jwt-secret-2026
JWT_EXPIRES_IN=7d
REDIS_HOST=localhost
REDIS_PORT=6379
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=evolution-key-2026
WHATSAPP_INSTANCE_1=whatsapp-1
WHATSAPP_INSTANCE_2=whatsapp-2
WHATSAPP_INSTANCE_3=whatsapp-3
WHATSAPP_INSTANCE_4=whatsapp-4
LEAD_ASSIGNMENT_MODE=MANUAL
AUTO_EXCEL_REPORTS=true
NIGHT_REPORT_TIME=09:00
DAY_REPORT_TIME=20:00
FRONTEND_URL=*
EOF

npm install
npm run build
npx prisma generate
npx prisma migrate deploy
npx prisma db seed || true

pm2 delete whatsapp-crm-api || true
pm2 start dist/main.js --name whatsapp-crm-api -i 2
pm2 save

echo "✅ Deployed!"
ENDSSH

echo "🎉 Deployment complete!"
echo "📍 http://188.241.217.76:3000/api/v1"
