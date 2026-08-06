import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app    = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const port   = config.get<number>('port') ?? 4000;
  const logger = new Logger('Bootstrap');

  // ── Security ──────────────────────────────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());

  // ── CORS ──────────────────────────────────────────────────────────────────
  const frontendUrl = config.get<string>('frontend.url') ?? '';
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || frontendUrl.split(',').map(s => s.trim()).includes(origin)) {
        return cb(null, true);
      }
      if (/\.vercel\.app$/.test(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Global prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api', { exclude: ['health', 'webhook/(.*)'] });

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Health check ──────────────────────────────────────────────────────────
  app.getHttpAdapter().get('/health', (_req: unknown, res: { json: (o: unknown) => void }) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
  });

  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 CRM Backend running on port ${port}`);
}

void bootstrap();
