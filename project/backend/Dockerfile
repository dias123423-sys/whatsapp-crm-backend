# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Generate Prisma client, then compile TypeScript
RUN npx prisma generate --schema=src/database/prisma/schema.prisma
RUN npm run build

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Required by Prisma on Alpine (OpenSSL 3)
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output + Prisma artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY src/database/prisma/schema.prisma ./prisma/schema.prisma

# Persistent directories (mount as volumes in docker-compose)
RUN mkdir -p reports logs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
