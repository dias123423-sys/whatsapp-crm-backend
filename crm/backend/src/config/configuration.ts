export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  database: {
    url: process.env.DATABASE_URL,
    directUrl: process.env.DATABASE_DIRECT_URL,
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-prod',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  evolution: {
    url: process.env.EVOLUTION_API_URL ?? 'http://localhost:8080',
    apiKey: process.env.EVOLUTION_API_KEY ?? '',
  },

  webhook: {
    secret: process.env.WEBHOOK_SECRET ?? '',
    url: process.env.WEBHOOK_URL ?? 'http://localhost:4000/webhook/evolution',
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    chatId: process.env.TELEGRAM_CHAT_ID ?? '',
  },

  frontend: {
    url: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  },

  report: {
    cron: process.env.REPORT_CRON ?? '0 8 * * *',
  },
});
