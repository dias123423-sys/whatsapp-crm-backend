import api from './axios';

export const whatsappApi = {
  getAll: () => api.get('/whatsapp').then((r) => r.data),
  getStatus: (name: string) => api.get(`/whatsapp/${name}/status`).then((r) => r.data),
  getQr: (name: string) => api.get(`/whatsapp/${name}/qr`).then((r) => r.data),
  create: (instanceName: string) => api.post('/whatsapp', { instanceName }).then((r) => r.data),
  delete: (name: string) => api.delete(`/whatsapp/${name}`).then((r) => r.data),
};
