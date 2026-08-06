import api from './axios';

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const leadsApi = {
  getMyLeads: (params?: any) => api.get('/leads/my', { params }).then((r) => r.data),
  getById: (id: string) => api.get(`/leads/${id}`).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/leads/${id}`, data).then((r) => r.data),
};

export const callsApi = {
  log: (leadId: string, data: any) =>
    api.post(`/calls/lead/${leadId}`, data).then((r) => r.data),
  getByLead: (leadId: string) =>
    api.get(`/calls/lead/${leadId}`).then((r) => r.data),
};
