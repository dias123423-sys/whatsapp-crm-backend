import api from './axios';

export const usersApi = {
  getAll: () => api.get('/users').then((r) => r.data),
  create: (data: any) => api.post('/users', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data).then((r) => r.data),
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const reportsApi = {
  getList: () => api.get('/reports').then((r) => r.data),
  generateNight: () => api.post('/reports/generate/night').then((r) => r.data),
  generateDaily: () => api.post('/reports/generate/daily').then((r) => r.data),
  downloadUrl: (file: string) => `/api/reports/download?file=${file}`,
};

export const assignmentApi = {
  getConfig: () => api.get('/assignment/config').then((r) => r.data),
  updateStrategy: (strategy: string) =>
    api.put('/assignment/strategy', { strategy }).then((r) => r.data),
};
