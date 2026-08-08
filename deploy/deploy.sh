#!/bin/bash

# WhatsApp Lead CRM - Production Deployment Script
# Server: 188.241.217.76

set -e

echo "🚀 WhatsApp Lead CRM - Production Deployment"
echo "=============================================="

# Configuration
SERVER_USER="root"
SERVER_IP="188.241.217.76"
APP_NAME="whatsapp-crm"
APP_DIR="/var/www/${APP_NAME}"
DOMAIN="api.yourdomain.com"  # CHANGE THIS

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${YELLOW}⚠️  Before deployment:${NC}"
echo "1. Make sure you have SSH access to ${SERVER_IP}"
echo "2. Update DOMAIN in this script"
echo "3. Update Evolution API settings in production.env"
echo "4. Update CORS_ORIGIN in production.env"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Step 1: Connect and prepare server
echo ""
echo -e "${GREEN}📡 Step 1: Preparing server...${NC}"

ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
set -e

echo "Updating system..."
apt update && apt upgrade -y

echo "Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

echo "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    apt install -y docker-compose
fi

echo "Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
fi

echo "Installing Certbot..."
if ! command -v certbot &> /dev/null; then
    apt install -y certbot python3-certbot-nginx
fi

echo "Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

echo "✅ Server prepared!"
ENDSSH

# Step 2: Create application directory
echo ""
echo -e "${GREEN}📁 Step 2: Creating application directory...${NC}"

ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
mkdir -p ${APP_DIR}
mkdir -p ${APP_DIR}/storage/reports
mkdir -p ${APP_DIR}/logs
ENDSSH

# Step 3: Upload backend code
echo ""
echo -e "${GREEN}📦 Step 3: Uploading backend code...${NC}"

# Create temporary archive
cd ..
tar -czf /tmp/backend-deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='logs' \
  --exclude='storage/reports/*.xlsx' \
  src/ \
  prisma/ \
  package.json \
  package-lock.json \
  tsconfig.json \
  nest-cli.json \
  .prettierrc \
  .eslintrc.js \
  deploy/

# Upload to server
scp /tmp/backend-deploy.tar.gz ${SERVER_USER}@${SERVER_IP}:${APP_DIR}/
rm /tmp/backend-deploy.tar.gz

# Extract on server
ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
cd ${APP_DIR}
tar -xzf backend-deploy.tar.gz
rm backend-deploy.tar.gz
ENDSSH

# Step 4: Upload and configure .env
echo ""
echo -e "${GREEN}⚙️  Step 4: Configuring environment...${NC}"

scp deploy/production.env ${SERVER_USER}@${SERVER_IP}:${APP_DIR}/.env

echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Update these in .env on server:${NC}"
echo "1. JWT_SECRET - change to random string"
echo "2. EVOLUTION_API_URL - your Evolution API URL"
echo "3. EVOLUTION_API_KEY - your Evolution API key"
echo "4. CORS_ORIGIN - your frontend URLs"
echo ""
read -p "Press Enter after you've updated .env on server..."

# Step 5: Install dependencies and build
echo ""
echo -e "${GREEN}🔨 Step 5: Installing dependencies and building...${NC}"

ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
cd ${APP_DIR}

echo "Installing dependencies..."
npm ci --only=production

echo "Generating Prisma client..."
npx prisma generate

echo "Building application..."
npm run build

echo "✅ Build complete!"
ENDSSH

# Step 6: Setup PostgreSQL
echo ""
echo -e "${GREEN}🗄️  Step 6: Setting up PostgreSQL...${NC}"

ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
set -e

# Install PostgreSQL
if ! command -v psql &> /dev/null; then
    apt install -y postgresql postgresql-contrib
fi

# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOF
-- Create database if not exists
SELECT 'CREATE DATABASE whatsapp_lead_crm'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'whatsapp_lead_crm')\gexec

-- Set password
ALTER USER postgres WITH PASSWORD 'Cococage_1234';
EOF

echo "✅ PostgreSQL configured!"
ENDSSH

# Step 7: Run migrations and seed
echo ""
echo -e "${GREEN}🌱 Step 7: Running migrations and seed...${NC}"

ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
cd ${APP_DIR}

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Seeding database..."
npx prisma db seed || echo "Seed already run or failed"

echo "✅ Database ready!"
ENDSSH

# Step 8: Setup Redis
echo ""
echo -e "${GREEN}🔴 Step 8: Setting up Redis...${NC}"

ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
if ! command -v redis-server &> /dev/null; then
    apt install -y redis-server
fi

systemctl start redis-server
systemctl enable redis-server

echo "✅ Redis configured!"
ENDSSH

# Step 9: Setup PM2
echo ""
echo -e "${GREEN}⚡ Step 9: Setting up PM2...${NC}"

ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
cd ${APP_DIR}

# Create PM2 ecosystem file
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
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '500M',
  }]
};
EOF

# Start with PM2
pm2 delete whatsapp-crm-api 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo "✅ PM2 configured and started!"
ENDSSH

# Step 10: Setup Nginx
echo ""
echo -e "${GREEN}🌐 Step 10: Setting up Nginx...${NC}"

ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
# Create Nginx config
cat > /etc/nginx/sites-available/whatsapp-crm-api << 'EOF'
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/whatsapp-crm-api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo "✅ Nginx configured!"
ENDSSH

# Summary
echo ""
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "=============================================="
echo ""
echo "📍 API URL: http://${SERVER_IP}:3000/api/v1"
echo "📍 Swagger: http://${SERVER_IP}:3000/api/docs"
echo ""
echo "🔑 Default credentials:"
echo "   Admin: admin@callcenter.com / admin123"
echo "   Operator: aizhan@callcenter.com / operator123"
echo ""
echo -e "${YELLOW}⚠️  Next steps:${NC}"
echo "1. Update DNS to point ${DOMAIN} to ${SERVER_IP}"
echo "2. Install SSL: ssh ${SERVER_USER}@${SERVER_IP} 'certbot --nginx -d ${DOMAIN}'"
echo "3. Test API: curl http://${SERVER_IP}:3000/api/v1/auth/login"
echo "4. Configure Evolution API webhook"
echo "5. Deploy frontend to Vercel"
echo ""
echo "📊 Monitor logs:"
echo "   ssh ${SERVER_USER}@${SERVER_IP} 'pm2 logs whatsapp-crm-api'"
echo ""
echo "🎉 Backend is live!"
