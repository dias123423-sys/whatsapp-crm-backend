import api from './axios';

export const leadsApi = {
  getAll: (params?: any) => api.get('/leads', { params }).then((r) => r.data),
  getById: (id: string) => api.get(`/leads/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/leads', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/leads/${id}`, data).then((r) => r.data),
  getDashboard: () => api.get('/leads/dashboard').then((r) => r.data),
};
