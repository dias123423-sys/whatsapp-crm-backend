import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface JwtPayload {
  username: string;
  iat: number;
  exp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { username: string };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Токен не предоставлен' });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({ success: false, message: 'JWT_SECRET не задан' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.user = { username: payload.username };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Недействительный или истёкший токен' });
  }
}
