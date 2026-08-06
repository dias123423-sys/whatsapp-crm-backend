import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const body = LoginSchema.parse(req.body);

    const adminUser = process.env.ADMIN_USERNAME ?? 'admin';
    const adminPass = process.env.ADMIN_PASSWORD ?? '';

    if (body.username !== adminUser || body.password !== adminPass) {
      res.status(401).json({ success: false, message: 'Неверный логин или пароль' });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ success: false, message: 'JWT_SECRET не настроен' });
      return;
    }

    const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'];
    const token = jwt.sign({ username: body.username }, secret, { expiresIn });

    res.json({ success: true, token });
  }),
);

// GET /api/auth/me
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({ success: true, data: { username: req.user?.username } });
});

export default router;
