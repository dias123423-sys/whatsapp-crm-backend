/**
 * WhatsApp Manager
 *
 * On startup:
 *  1. Creates/verifies all 4 instances in Evolution API
 *  2. Sets webhook URL for each
 *  3. Polls connection state and syncs to DB + pushes via Socket.IO
 *
 * During runtime:
 *  - Handles incoming webhook events (QRCODE_UPDATED, CONNECTION_UPDATE, MESSAGES_UPSERT)
 *    forwarded by webhook.routes.ts
 *  - Provides status/QR data for the REST API
 */

import { prisma } from '../database/prisma.client';
import { evolutionClient } from './evolution.client';
import { socketService } from '../services/socket.service';
import { logger } from '../utils/logger';

const WA_ACCOUNTS = ['WA1', 'WA2', 'WA3', 'WA4'] as const;
export type WAAccountId = (typeof WA_ACCOUNTS)[number];

// In-memory state — authoritative for QR codes (not persisted)
interface AccountState {
  accountId: WAAccountId;
  isConnected: boolean;
  phoneNumber?: string;
  qrCode?: string;
  lastSeen?: Date;
}

const state = new Map<WAAccountId, AccountState>();

// ─── Initialise all 4 accounts ───────────────────────────────────────────────

export async function initWhatsAppManager(): Promise<void> {
  logger.info('📱 Initialising WhatsApp manager (Evolution API)…');

  const webhookUrl = process.env.WEBHOOK_URL ?? 'http://localhost:3001/webhook/evolution';

  // Ensure DB rows exist for all 4 accounts
  for (const accountId of WA_ACCOUNTS) {
    await prisma.whatsAppSession.upsert({
      where:  { accountId },
      create: { accountId, isConnected: false },
      update: {},
    });

    state.set(accountId, { accountId, isConnected: false });
  }

  // Create instances in Evolution API (idempotent — returns 400 if exists)
  for (const accountId of WA_ACCOUNTS) {
    try {
      await evolutionClient.createInstance(accountId, webhookUrl);
      await evolutionClient.setWebhook(accountId, webhookUrl);
    } catch (err) {
      logger.error(`[Manager] Failed to init instance ${accountId}:`, err);
    }
  }

  // Initial status sync
  await syncAllStatuses();

  // Poll connection status every 30 s as a fallback to webhook events
  setInterval(() => { void syncAllStatuses(); }, 30_000);

  logger.info('✅ WhatsApp manager ready');
}

// ─── Status sync ─────────────────────────────────────────────────────────────

async function syncAllStatuses(): Promise<void> {
  for (const accountId of WA_ACCOUNTS) {
    try {
      const connState = await evolutionClient.getConnectionState(accountId);
      const isConnected = connState === 'open';
      await updateAccountState(accountId, { isConnected });
    } catch (err) {
      logger.debug(`[Manager] Status check failed for ${accountId}: ${String(err)}`);
    }
  }
}

async function updateAccountState(
  accountId: WAAccountId,
  patch: Partial<AccountState>,
): Promise<void> {
  const current = state.get(accountId) ?? { accountId, isConnected: false };
  const updated  = { ...current, ...patch };
  state.set(accountId, updated);

  // Persist to DB
  await prisma.whatsAppSession.update({
    where: { accountId },
    data: {
      isConnected: updated.isConnected,
      phoneNumber: updated.phoneNumber ?? null,
      qrCode:      updated.qrCode ?? null,
      lastSeen:    updated.isConnected ? new Date() : undefined,
    },
  });

  // Push to dashboard
  socketService.emitWhatsAppStatus({
    accountId,
    isConnected:  updated.isConnected,
    phoneNumber:  updated.phoneNumber,
    hasQR:        Boolean(updated.qrCode),
  });
}

// ─── Webhook event handlers ──────────────────────────────────────────────────

/**
 * Called by webhook.routes.ts for every Evolution API event.
 */
export async function handleEvolutionEvent(
  instanceName: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  const accountId = instanceName as WAAccountId;
  if (!WA_ACCOUNTS.includes(accountId)) {
    logger.debug(`[Manager] Unknown instance: ${instanceName}`);
    return;
  }

  logger.debug(`[Manager] Event ${event} on ${instanceName}`);

  switch (event) {
    case 'QRCODE_UPDATED': {
      const qr = (data.qrcode as { code?: string })?.code ?? (data.code as string | undefined);
      if (qr) {
        await updateAccountState(accountId, { isConnected: false, qrCode: qr });
        socketService.emitWhatsAppQR({ accountId, qr });
        logger.info(`[Manager] QR updated for ${accountId}`);
      }
      break;
    }

    case 'CONNECTION_UPDATE': {
      const status = data.state as string | undefined;
      if (status === 'open') {
        const phone = (data.instance as { owner?: string } | undefined)?.owner ??
                      (data.wuid as string | undefined);
        await updateAccountState(accountId, {
          isConnected: true,
          phoneNumber: phone,
          qrCode: undefined,
        });
        logger.info(`[Manager] ${accountId} connected — ${phone ?? 'unknown'}`);

        await prisma.activityLog.create({
          data: {
            accountId,
            eventType: 'whatsapp:connected',
            message:   `${accountId} подключён: ${phone ?? ''}`,
          },
        });
      } else if (status === 'close') {
        await updateAccountState(accountId, { isConnected: false, phoneNumber: undefined });
        logger.warn(`[Manager] ${accountId} disconnected`);
      }
      break;
    }

    // MESSAGES_UPSERT is handled by webhook.routes.ts → appointment parser
    // We only do state updates here.
    default:
      break;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getAllStatuses(): AccountState[] {
  return WA_ACCOUNTS.map((id) => state.get(id) ?? { accountId: id, isConnected: false });
}

export function getAccountState(accountId: WAAccountId): AccountState | undefined {
  return state.get(accountId);
}

/**
 * Reset an account: logout from Evolution API, clear state, next event = new QR.
 */
export async function resetAccount(accountId: WAAccountId): Promise<void> {
  try {
    await evolutionClient.logoutInstance(accountId);
  } catch {
    // Ignore if already disconnected
  }

  await updateAccountState(accountId, {
    isConnected: false,
    phoneNumber: undefined,
    qrCode: undefined,
  });

  logger.info(`[Manager] ${accountId} reset — waiting for new QR`);
}

/**
 * Fetch live QR from Evolution API (REST fallback when Socket.IO missed the event).
 */
export async function fetchQRCode(accountId: WAAccountId): Promise<string | null> {
  const cached = state.get(accountId);
  if (cached?.isConnected) return null; // already connected

  // Try live fetch
  const qr = await evolutionClient.getQRCode(accountId);
  if (qr) {
    // Update cache but don't await DB write — just push to dashboard
    const current = state.get(accountId) ?? { accountId, isConnected: false };
    state.set(accountId, { ...current, qrCode: qr });
    socketService.emitWhatsAppQR({ accountId, qr });
  }
  return qr;
}
