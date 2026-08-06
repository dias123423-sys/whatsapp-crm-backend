'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '@/lib/api';
import { WhatsAppStatus } from '@/types';
import { WhatsAppStatusBadge } from './ui/WhatsAppStatusBadge';
import { useWhatsAppSocket } from '@/hooks/useSocket';
import { Wifi, QrCode, RotateCcw } from 'lucide-react';

const WA_ACCOUNTS = ['WA1', 'WA2', 'WA3', 'WA4'] as const;
// WhatsApp QR expires in ~20 seconds. Polling at 15s keeps it fresh without
// hammering the backend — Socket.IO pushes the new QR immediately anyway.
const QR_REFRESH_INTERVAL_MS = 15_000;

export function WhatsAppPanel() {
  const [statuses, setStatuses] = useState<Record<string, WhatsAppStatus>>({});
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [showQR, setShowQR] = useState<string | null>(null);

  const setQR = useCallback((accountId: string, qr: string) => {
    setQrCodes((prev) => {
      // The API is polled as a fallback when Socket.IO reconnects.
      if (prev[accountId] === qr) return prev;
      return { ...prev, [accountId]: qr };
    });
  }, []);

  const fetchQRCode = useCallback(async (accountId: string) => {
    try {
      const res = await api.get(`/api/whatsapp/${accountId}/qr`, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      const data = res.data?.data;
      if (data?.qrCode && !data?.isConnected) {
        setQR(accountId, data.qrCode);
        return;
      }

      if (data?.isConnected) {
        setQrCodes((prev) => {
          const next = { ...prev };
          delete next[accountId];
          return next;
        });
        setShowQR((current) => (current === accountId ? null : current));
      }
    } catch {
      // The next poll will retry; a temporary network error must not hide QR.
    }
  }, [setQR]);

  const { data: sessions } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const res = await api.get('/api/whatsapp/status');
      const { sessions, clients } = res.data.data as {
        sessions: WhatsAppStatus[];
        clients: { accountId: string; isActive: boolean }[];
      };

      // Merge DB sessions with real-time client status.
      // If the client reports isActive=true, treat as connected even if DB
      // hasn't been updated yet (e.g. right after a redeploy).
      const clientMap = new Map(clients.map((c) => [c.accountId, c.isActive]));
      return sessions.map((s) => ({
        ...s,
        isConnected: s.isConnected || (clientMap.get(s.accountId) ?? false),
      })) as WhatsAppStatus[];
    },
    refetchInterval: 5000,
  });

  // On mount — pull QR only for the currently-open panel (if any). We do NOT
  // pre-fetch all four accounts here: WA3 and WA4 initialize ~10–20 s after
  // the server starts, so polling them immediately produces a wall of 200
  // responses with qrCode:null and achieves nothing. Socket.IO will push the
  // QR as soon as the client emits it.
  useEffect(() => {
    if (showQR) void fetchQRCode(showQR);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount only

  useEffect(() => {
    if (!sessions) return;
    const map: Record<string, WhatsAppStatus> = {};
    sessions.forEach((s) => { map[s.accountId] = s; });
    setStatuses(map);

    // Only fetch QR for accounts that the server already knows about (session
    // row exists) AND are not connected. Accounts still initializing have no
    // DB row yet, so polling them returns qrCode:null every time — pure noise.
    sessions.forEach((s) => {
      if (s.isConnected) return;
      // `hasQR` is included in the /status response; only hit the QR endpoint
      // when there is actually something to retrieve.
      if (!s.hasQR) return;
      void fetchQRCode(s.accountId);
    });
  }, [sessions, fetchQRCode]);

  // Socket.IO may reconnect while a QR code is being regenerated. Poll the
  // currently opened account as a reliable fallback, so the QR never stays on
  // the "updating" placeholder.
  useEffect(() => {
    if (!showQR || statuses[showQR]?.isConnected) return;

    void fetchQRCode(showQR);
    const interval = setInterval(() => { void fetchQRCode(showQR); }, QR_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [showQR, statuses, fetchQRCode]);

  const handleStatusChange = useCallback((status: WhatsAppStatus) => {
    console.log('[WhatsAppPanel] Status changed:', status);
    setStatuses((prev) => ({ ...prev, [status.accountId]: status }));
    if (status.isConnected) {
      console.log('[WhatsAppPanel] Account connected, clearing QR:', status.accountId);
      setQrCodes((prev) => { const n = { ...prev }; delete n[status.accountId]; return n; });
      setShowQR((cur) => (cur === status.accountId ? null : cur));
    }
  }, []);

  const handleQRCode = useCallback((accountId: string, qr: string) => {
    setQR(accountId, qr);
    setShowQR((cur) => cur ?? accountId);
  }, [setQR]);

  const resetAccount = useCallback(async (accountId: string) => {
    if (!window.confirm(`Сбросить ${accountId}? Сохранённый номер будет отвязан, и появится новый QR-код.`)) {
      return;
    }

    try {
      await api.post(`/api/whatsapp/${accountId}/reset`);
      setStatuses((prev) => ({
        ...prev,
        [accountId]: { ...prev[accountId], accountId: accountId as WhatsAppStatus['accountId'], isConnected: false, phoneNumber: undefined },
      }));
      setQrCodes((prev) => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
      setShowQR(accountId);
    } catch {
      window.alert('Не удалось сбросить аккаунт. Попробуйте ещё раз через несколько секунд.');
    }
  }, []);

  useWhatsAppSocket(handleStatusChange, handleQRCode);

  const connectedCount = Object.values(statuses).filter((s) => s.isConnected).length;
  const activeQr = showQR && qrCodes[showQR] ? showQR : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Wifi size={16} className="text-green-500" />
          WhatsApp Аккаунты
        </h2>
        <span className="text-sm text-gray-500">{connectedCount}/4 подключено</span>
      </div>

      <div className="space-y-2">
        {WA_ACCOUNTS.map((accountId) => {
          const status = statuses[accountId];
          const isConnected = status?.isConnected ?? false;
          const qr = qrCodes[accountId];
          const isOpen = activeQr === accountId;

          return (
            <div key={accountId} className="rounded-lg border border-gray-100 p-2.5">
              <div className="flex items-center gap-2 justify-between">
                <WhatsAppStatusBadge
                  accountId={accountId}
                  isConnected={isConnected}
                  phoneNumber={status?.phoneNumber}
                />
                <div className="flex items-center gap-1">
                  {!isConnected && (
                    <button
                      onClick={() => setShowQR(isOpen ? null : accountId)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                        isOpen ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-500'
                      }`}
                      title="Показать QR код"
                    >
                      <QrCode size={14} />
                      QR
                    </button>
                  )}
                  <button
                    onClick={() => void resetAccount(accountId)}
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title={`Сбросить ${accountId} и отвязать номер`}
                    aria-label={`Сбросить ${accountId}`}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 p-3 bg-gray-50 border border-gray-100 rounded-lg text-center">
                  {qr ? (
                    <>
                      <p className="text-xs text-gray-500 mb-2">
                        WhatsApp → Связанные устройства → Привязать устройство
                      </p>
                      <div className="relative inline-block">
                        <QRCodeSVG
                          value={qr}
                          size={180}
                          className="mx-auto bg-white p-2 rounded"
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-gray-400">
                        QR обновляется автоматически
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 py-6">
                      QR ещё генерируется… подождите несколько секунд
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="status-dot bg-emerald-500" />
          {connectedCount} онлайн
        </span>
        <span className="flex items-center gap-1">
          <span className="status-dot bg-gray-400" />
          {4 - connectedCount} оффлайн
        </span>
      </div>
    </div>
  );
}
