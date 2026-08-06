import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import {
  getAllStatuses,
  getAccountState,
  resetAccount,
  fetchQRCode,
  WAAccountId,
} from '../whatsapp/manager';
import { prisma } from '../database/prisma.client';

const router = Router();

router.use(authMiddleware);

// ── GET /api/whatsapp/status ──────────────────────────────────────────────────
// Returns current in-memory + DB state for all 4 accounts.
// Response shape matches what WhatsAppPanel.tsx expects:
//   { sessions: WhatsAppStatus[], clients: { accountId, isActive }[] }
router.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    const memStates = getAllStatuses();

    const sessions = await prisma.whatsAppSession.findMany();

    // Merge DB sessions with live in-memory state
    const merged = sessions.map((s) => {
      const live = memStates.find((m) => m.accountId === s.accountId);
      return {
        accountId:   s.accountId,
        isConnected: live?.isConnected ?? s.isConnected,
        phoneNumber: live?.phoneNumber ?? s.phoneNumber ?? undefined,
        hasQR:       Boolean(live?.qrCode),
        lastSeen:    s.lastSeen?.toISOString(),
      };
    });

    // Ensure all 4 accounts present even if DB row missing
    const ACCOUNTS = ['WA1', 'WA2', 'WA3', 'WA4'];
    for (const acc of ACCOUNTS) {
      if (!merged.find((s) => s.accountId === acc)) {
        const live = memStates.find((m) => m.accountId === acc);
        merged.push({
          accountId:   acc,
          isConnected: live?.isConnected ?? false,
          phoneNumber: live?.phoneNumber,
          hasQR:       Boolean(live?.qrCode),
          lastSeen:    undefined,
        });
      }
    }

    const clients = memStates.map((m) => ({
      accountId: m.accountId,
      isActive:  m.isConnected,
    }));

    res.json({ success: true, data: { sessions: merged, clients } });
  }),
);

// ── GET /api/whatsapp/:id/qr ──────────────────────────────────────────────────
router.get(
  '/:id/qr',
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.params.id.toUpperCase() as WAAccountId;
    const live = getAccountState(accountId);

    if (live?.isConnected) {
      res.json({ success: true, data: { isConnected: true, qrCode: null } });
      return;
    }

    // Return cached QR or fetch from Evolution API
    const qr = live?.qrCode ?? (await fetchQRCode(accountId));

    res.json({
      success: true,
      data: {
        isConnected: false,
        qrCode: qr ?? null,
      },
    });
  }),
);

// ── POST /api/whatsapp/:id/reset ──────────────────────────────────────────────
router.post(
  '/:id/reset',
  asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.params.id.toUpperCase() as WAAccountId;
    await resetAccount(accountId);
    res.json({ success: true, message: `${accountId} сброшен. Отсканируйте новый QR.` });
  }),
);

export default router;
