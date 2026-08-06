import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });
}

// Reuse client in development to avoid exhausting connection pool on hot-reload
export const prisma: PrismaClient =
  process.env.NODE_ENV === 'production'
    ? createPrismaClient()
    : (global.__prisma ?? (global.__prisma = createPrismaClient()));

if (process.env.NODE_ENV !== 'production') {
  (prisma as unknown as { $on: (event: string, cb: (e: unknown) => void) => void })
    .$on('error', (e) => logger.error('Prisma error', e));
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
  } catch (err) {
    logger.error('❌ Database connection failed', err);
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
