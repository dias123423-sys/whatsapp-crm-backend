import { io, Socket } from 'socket.io-client';
import type { WebSocketEvent, Lead, WhatsAppAccount, Operator } from '@/types';

const WS_URL = import.meta.env.VITE_WS_URL || 'wss://188-241-217-76.nip.io';

class SocketClient {
  private socket: Socket | null = null;
  private listeners: Map<WebSocketEvent, Set<(data: any) => void>> = new Map();

  connect(token: string) {
    if (this.socket?.connected) return;

    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Setup event listeners
    this.setupEventListeners();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  private setupEventListeners() {
    if (!this.socket) return;

    // Lead events
    this.socket.on('lead.created', (data: Lead) => {
      this.emit('lead.created', data);
    });

    this.socket.on('lead.updated', (data: Lead) => {
      this.emit('lead.updated', data);
    });

    this.socket.on('lead.assigned', (data: { lead: Lead; operatorId: string }) => {
      this.emit('lead.assigned', data);
    });

    this.socket.on('lead.status_changed', (data: { lead: Lead; oldStatus: string; newStatus: string }) => {
      this.emit('lead.status_changed', data);
    });

    // WhatsApp events
    this.socket.on('whatsapp.connected', (data: WhatsAppAccount) => {
      this.emit('whatsapp.connected', data);
    });

    this.socket.on('whatsapp.disconnected', (data: WhatsAppAccount) => {
      this.emit('whatsapp.disconnected', data);
    });

    this.socket.on('whatsapp.qr_updated', (data: { accountId: string; qrCode: string }) => {
      this.emit('whatsapp.qr_updated', data);
    });

    this.socket.on('whatsapp.error', (data: { accountId: string; error: string }) => {
      this.emit('whatsapp.error', data);
    });

    // Operator events
    this.socket.on('operator.updated', (data: Operator) => {
      this.emit('operator.updated', data);
    });
  }

  on<T = any>(event: WebSocketEvent, callback: (data: T) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  private emit(event: WebSocketEvent, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketClient = new SocketClient();
