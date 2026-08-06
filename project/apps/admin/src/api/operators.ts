import api from './axios';

export const operatorsApi = {
  getAll: () => api.get('/operators').then((r) => r.data),
  getById: (id: string) => api.get(`/operators/${id}`).then((r) => r.data),
  getStats: (id: string) => api.get(`/operators/${id}/stats`).then((r) => r.data),
  updateStatus: (id: string, status: string) =>
    api.put(`/operators/${id}/status`, { status }).then((r) => r.data),
};
