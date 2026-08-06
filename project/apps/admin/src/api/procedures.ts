import api from './axios';

export const proceduresApi = {
  getAll: () => api.get('/procedures').then((r) => r.data),
  create: (data: any) => api.post('/procedures', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/procedures/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/procedures/${id}`).then((r) => r.data),
};
