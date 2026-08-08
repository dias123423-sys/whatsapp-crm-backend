import { api } from '@/lib/api';
import type { WhatsAppAccount, WhatsAppQRResponse } from '@/types';

export const whatsappApi = {
  // Get all 4 WhatsApp accounts
  getAll: () => api.get<WhatsAppAccount[]>('/whatsapp'),
  
  // Get single account
  getOne: (id: string) => api.get<WhatsAppAccount>(`/whatsapp/${id}`),
  
  // Generate QR code for connection
  generateQR: (id: string) => api.post<WhatsAppQRResponse>(`/whatsapp/${id}/qr`),
  
  // Disconnect WhatsApp
  disconnect: (id: string) => api.post(`/whatsapp/${id}/disconnect`),
  
  // Reconnect WhatsApp
  reconnect: (id: string) => api.post(`/whatsapp/${id}/reconnect`),
  
  // Get connection status
  getStatus: (id: string) => api.get<{ status: string }>(`/whatsapp/${id}/status`),
};
