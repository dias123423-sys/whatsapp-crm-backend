import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { appointmentService } from '../services/appointment.service';
import { WhatsAppAccount, CreatedBy } from '@prisma/client';
import { ExportType } from '../services/excel.service';
import { format } from 'date-fns';

const router = Router();

// All appointment routes require auth
router.use(authMiddleware);

// ── GET /api/appointments ─────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const filters = {
      search:          req.query.search as string | undefined,
      startDate:       req.query.startDate as string | undefined,
      endDate:         req.query.endDate as string | undefined,
      whatsappAccount: req.query.whatsappAccount as WhatsAppAccount | undefined,
      createdBy:       req.query.createdBy as CreatedBy | undefined,
      page:            req.query.page  ? Number(req.query.page)  : 1,
      limit:           req.query.limit ? Number(req.query.limit) : 50,
    };

    const result = await appointmentService.findMany(filters);
    res.json({ success: true, ...result });
  }),
);

// ── GET /api/appointments/stats ───────────────────────────────────────────────
router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await appointmentService.getStats();
    res.json({ success: true, data: stats });
  }),
);

// ── GET /api/appointments/export ──────────────────────────────────────────────
router.get(
  '/export',
  asyncHandler(async (req: Request, res: Response) => {
    const ExportTypeSchema = z.enum(['AINUR', 'AIBEK', 'BOT', 'ALL']).default('ALL');
    const exportType = ExportTypeSchema.parse(req.query.type) as ExportType;

    const buffer = await appointmentService.exportExcel(exportType);
    const fileName = `appointments_${exportType}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }),
);

// ── GET /api/appointments/:id ─────────────────────────────────────────────────
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const appointment = await appointmentService.findById(req.params.id);
    if (!appointment) {
      res.status(404).json({ success: false, message: 'Запись не найдена' });
      return;
    }
    res.json({ success: true, data: appointment });
  }),
);

// ── DELETE /api/appointments/:id ──────────────────────────────────────────────
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await appointmentService.delete(req.params.id);
      res.json({ success: true, message: 'Запись удалена' });
    } catch {
      res.status(404).json({ success: false, message: 'Запись не найдена' });
    }
  }),
);

export default router;
