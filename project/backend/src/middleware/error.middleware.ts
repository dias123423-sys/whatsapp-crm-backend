import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Zod validation errors → 422
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      message: 'Validation error',
      errors: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
    return;
  }

  // Generic errors
  const message =
    err instanceof Error ? err.message : 'Внутренняя ошибка сервера';

  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { status?: number; statusCode?: number })?.statusCode ??
    500;

  if (status >= 500) {
    logger.error(`[${req.method}] ${req.path} — ${message}`, err);
  } else {
    logger.warn(`[${req.method}] ${req.path} — ${status} ${message}`);
  }

  res.status(status).json({ success: false, message });
}

/** Wrap async route handlers to forward errors to errorMiddleware */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
