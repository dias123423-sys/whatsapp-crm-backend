/**
 * Webhook endpoint that receives events from Evolution API.
 *
 * Evolution API POSTs to: POST /webhook/evolution
 *
 * Payload shape (Evolution API v2):
 * {
 *   event:        "MESSAGES_UPSERT" | "CONNECTION_UPDATE" | "QRCODE_UPDATED" | ...
 *   instance:     "WA1",
 *   data:         { ... event-specific payload ... },
 *   date_time:    "2025-07-12T14:00:00.000Z",
 *   sender:       "5521999999999@s.whatsapp.net",
 *   server_url:   "http://localhost:8080",
 *   apikey:       "..."
 * }
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { handleEvolutionEvent } from '../whatsapp/manager';
import { appointmentService } from '../services/appointment.service';
import {
  isAppointmentMessage,
  parseAppointmentFromMessage,
} from '../utils/appointment.detector';
import { logger } from '../utils/logger';
import { WhatsAppAccount } from '@prisma/client';

const router = Router();

const WA_ACCOUNTS = new Set(['WA1', 'WA2', 'WA3', 'WA4']);

// ── POST /webhook/evolution ───────────────────────────────────────────────────
router.post(
  '/evolution',
  asyncHandler(async (req: Request, res: Response) => {
    // Respond immediately — Evolution API expects 200 fast
    res.status(200).json({ success: true });

    const body = req.body as {
      event?: string;
      instance?: string;
      data?: Record<string, unknown>;
    };

    const { event, instance: instanceName, data = {} } = body;

    if (!event || !instanceName) return;

    logger.debug(`[Webhook] ${event} from ${instanceName}`);

    // ── Forward to WhatsApp manager (QR, connection state) ──────────────────
    await handleEvolutionEvent(instanceName, event, data);

    // ── Handle incoming messages ─────────────────────────────────────────────
    if (event !== 'MESSAGES_UPSERT') return;
    if (!WA_ACCOUNTS.has(instanceName)) return;

    // Evolution API wraps messages in data.messages array
    const messages = Array.isArray(data.messages)
      ? (data.messages as Record<string, unknown>[])
      : [data];

    for (const msg of messages) {
      await processMessage(instanceName as WhatsAppAccount, msg);
    }
  }),
);

// ─── Message processing ───────────────────────────────────────────────────────

async function processMessage(
  accountId: WhatsAppAccount,
  msg: Record<string, unknown>,
): Promise<void> {
  try {
    // Extract text from various message types
    const text = extractText(msg);
    if (!text || text.length < 10) return;

    const fromMe = Boolean(msg.key && (msg.key as Record<string, unknown>).fromMe);

    if (!isAppointmentMessage(text)) return;

    logger.info(`[Webhook] Appointment message detected on ${accountId}: "${text.slice(0, 80)}"`);

    const parsed = parseAppointmentFromMessage(text, fromMe);

    if (!parsed.appointmentDate || !parsed.appointmentTime) {
      logger.debug('[Webhook] Could not extract date/time — skipping');
      return;
    }

    // Combine date + time into a single Date
    const [h, m] = parsed.appointmentTime.split(':').map(Number);
    const appointmentDate = new Date(parsed.appointmentDate);
    appointmentDate.setHours(h, m, 0, 0);

    await appointmentService.create({
      clientName:      parsed.clientName,
      phone:           parsed.phone ?? extractSenderPhone(msg) ?? '',
      appointmentDate,
      appointmentTime: parsed.appointmentTime,
      whatsappAccount: accountId,
      createdBy:       parsed.createdBy,
      rawMessage:      text,
    });
  } catch (err) {
    logger.error('[Webhook] Error processing message:', err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractText(msg: Record<string, unknown>): string {
  const msgContent = msg.message as Record<string, unknown> | undefined;
  if (!msgContent) return '';

  // Plain text
  if (typeof msgContent.conversation === 'string') return msgContent.conversation;

  // Extended text
  const ext = msgContent.extendedTextMessage as Record<string, unknown> | undefined;
  if (typeof ext?.text === 'string') return ext.text;

  // Button/list reply
  const btn = (
    msgContent.buttonsResponseMessage ??
    msgContent.listResponseMessage ??
    msgContent.templateButtonReplyMessage
  ) as Record<string, unknown> | undefined;
  if (typeof btn?.selectedDisplayText === 'string') return btn.selectedDisplayText;
  if (typeof btn?.title === 'string') return btn.title;

  return '';
}

function extractSenderPhone(msg: Record<string, unknown>): string {
  // Evolution API: key.remoteJid = "77011234567@s.whatsapp.net"
  const key = msg.key as Record<string, unknown> | undefined;
  const jid = key?.remoteJid as string | undefined;
  if (jid) {
    const num = jid.split('@')[0];
    if (num && /^\d{10,15}$/.test(num)) {
      return num.startsWith('7') ? `+${num}` : `+7${num}`;
    }
  }
  return '';
}

export default router;
