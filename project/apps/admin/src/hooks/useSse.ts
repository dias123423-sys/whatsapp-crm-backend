import { useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type SseEventType = 'new_lead' | 'lead_updated' | 'stats_updated';

interface SseOptions {
  onNewLead?: (lead: any) => void;
  onLeadUpdated?: (lead: any) => void;
  enabled?: boolean;
}

/**
 * Connects to GET /sse/events and calls the appropriate handler
 * whenever the backend pushes a real-time event.
 *
 * The JWT token is passed as a query param because the browser's native
 * EventSource API cannot set custom headers.
 */
export function useSse({ onNewLead, onLeadUpdated, enabled = true }: SseOptions) {
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const token = localStorage.getItem('token') || '';
    const url = `${API_URL}/sse/events?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('new_lead', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onNewLead?.(data);
      } catch {}
    });

    es.addEventListener('lead_updated', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onLeadUpdated?.(data);
      } catch {}
    });

    es.onerror = () => {
      // EventSource auto-reconnects on error — no action needed
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  // Re-connect if enabled changes; token is read fresh each time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
