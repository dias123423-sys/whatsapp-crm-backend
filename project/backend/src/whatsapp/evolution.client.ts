/**
 * HTTP client for Evolution API.
 *
 * Evolution API runs as a separate service (Docker container) on the same VPS.
 * All WhatsApp interactions go through its REST API — no direct Baileys/puppeteer
 * dependency in our backend.
 *
 * Relevant Evolution API endpoints used here:
 *   POST /instance/create
 *   GET  /instance/fetchInstances
 *   GET  /instance/connectionState/{instance}
 *   DELETE /instance/delete/{instance}
 *   DELETE /instance/logout/{instance}
 *   POST /instance/restart/{instance}
 *   GET  /instance/connect/{instance}         ← returns QR code
 *   POST /webhook/set/{instance}
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvolutionInstance {
  instanceName: string;
  instanceId?: string;
  status?: string;
  owner?: string;
  profileName?: string;
  profilePictureUrl?: string;
  connectionStatus?: 'open' | 'close' | 'connecting';
  token?: string;
}

export interface EvolutionQRResponse {
  code?: string;   // raw QR string (used to render QRCode)
  base64?: string; // base64 PNG
}

export interface EvolutionConnectionState {
  instance: {
    instanceName: string;
    state: 'open' | 'close' | 'connecting';
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

class EvolutionApiClient {
  private http: AxiosInstance;

  constructor() {
    const baseURL = process.env.EVOLUTION_API_URL ?? 'http://localhost:8080';
    const apiKey  = process.env.EVOLUTION_API_KEY  ?? '';

    this.http = axios.create({
      baseURL,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
    });

    // Log every outgoing request at debug level
    this.http.interceptors.request.use((config) => {
      logger.debug(`[Evolution] → ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // Log errors
    this.http.interceptors.response.use(
      (res) => res,
      (err: AxiosError) => {
        const status = err.response?.status;
        const url    = err.config?.url;
        logger.warn(`[Evolution] ← ${status ?? 'ERR'} ${url ?? ''} — ${err.message}`);
        return Promise.reject(err);
      },
    );
  }

  // ─── Instance management ─────────────────────────────────────────────────

  /**
   * Create a new WhatsApp instance in Evolution API.
   * If it already exists the API returns 400 — we catch and ignore that.
   */
  async createInstance(instanceName: string, webhookUrl: string): Promise<void> {
    try {
      await this.http.post('/instance/create', {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: [
            'QRCODE_UPDATED',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
          ],
        },
      });
      logger.info(`[Evolution] Instance created: ${instanceName}`);
    } catch (err) {
      const axErr = err as AxiosError;
      // 400 or 403 = already exists — that's fine
      if (axErr.response?.status === 400 || axErr.response?.status === 403) {
        logger.debug(`[Evolution] Instance ${instanceName} already exists (${axErr.response.status})`);
        return;
      }
      // Re-throw only non-existence errors, but log cleanly to avoid circular JSON crash
      logger.warn(`[Evolution] createInstance ${instanceName} failed: ${axErr.message}`);
    }
  }

  /**
   * Update webhook for an existing instance.
   */
  async setWebhook(instanceName: string, webhookUrl: string): Promise<void> {
    await this.http.post(`/webhook/set/${instanceName}`, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
      },
    });
    logger.info(`[Evolution] Webhook set for ${instanceName} → ${webhookUrl}`);
  }

  /**
   * Get QR code for an instance that is not yet connected.
   * Returns the raw QR string (suitable for qrcode libraries).
   */
  async getQRCode(instanceName: string): Promise<string | null> {
    try {
      const res = await this.http.get<{ base64?: string; code?: string }>(
        `/instance/connect/${instanceName}`,
      );
      // Evolution API returns { code: "...", base64: "data:image/png;base64,..." }
      return res.data.code ?? null;
    } catch (err) {
      const axErr = err as AxiosError;
      if (axErr.response?.status === 400 || axErr.response?.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Returns connection state for an instance: "open" | "close" | "connecting"
   */
  async getConnectionState(instanceName: string): Promise<'open' | 'close' | 'connecting'> {
    try {
      const res = await this.http.get<EvolutionConnectionState>(
        `/instance/connectionState/${instanceName}`,
      );
      return res.data.instance?.state ?? 'close';
    } catch {
      return 'close';
    }
  }

  /**
   * Fetch all instances and their basic info.
   */
  async fetchInstances(): Promise<EvolutionInstance[]> {
    try {
      const res = await this.http.get<EvolutionInstance[]>('/instance/fetchInstances');
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  }

  /**
   * Disconnect (logout) an instance — next connect will require a new QR scan.
   */
  async logoutInstance(instanceName: string): Promise<void> {
    await this.http.delete(`/instance/logout/${instanceName}`);
    logger.info(`[Evolution] Logged out: ${instanceName}`);
  }

  /**
   * Restart an instance (keeps session, reconnects).
   */
  async restartInstance(instanceName: string): Promise<void> {
    await this.http.post(`/instance/restart/${instanceName}`);
    logger.info(`[Evolution] Restarted: ${instanceName}`);
  }

  /**
   * Delete an instance completely from Evolution API.
   */
  async deleteInstance(instanceName: string): Promise<void> {
    await this.http.delete(`/instance/delete/${instanceName}`);
    logger.info(`[Evolution] Deleted: ${instanceName}`);
  }
}

export const evolutionClient = new EvolutionApiClient();
