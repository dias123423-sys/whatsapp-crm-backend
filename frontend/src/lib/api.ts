import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
};

export const leadsApi = {
  getAll: (params?: any) => api.get('/leads', { params }),
  getById: (id: string) => api.get(`/leads/${id}`),
  assign: (id: string, operatorId: string) =>
    api.post(`/leads/${id}/assign`, { operatorId }),
  updateStatus: (id: string, status: string, notes?: string) =>
    api.patch(`/leads/${id}`, { status, notes }),
};

export const operatorsApi = {
  getAll: () => api.get('/operators'),
  getById: (id: string) => api.get(`/operators/${id}`),
};

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
};
