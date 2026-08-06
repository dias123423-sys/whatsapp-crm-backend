import winston from 'winston';
import path from 'path';
import fs from 'fs';

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}]: ${stack ?? message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat,
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        errors({ stack: true }),
        timestamp({ format: 'HH:mm:ss' }),
        logFormat,
      ),
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 20 * 1024 * 1024, // 20 MB
      maxFiles: 10,
    }),
  ],
});
