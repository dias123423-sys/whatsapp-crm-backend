import axios, { AxiosInstance } from 'axios';
import Cookies from 'js-cookie';

// When NEXT_PUBLIC_API_URL is empty the requests go to the same origin
// (Vercel), and Next.js rewrites them server-side to Railway — no CORS.
// For local development set NEXT_PUBLIC_API_URL=http://localhost:3001.
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url || '');
    const isLoginRequest = url.includes('/api/auth/login');

    if (
      status === 401 &&
      !isLoginRequest &&
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/dashboard')
    ) {
      Cookies.remove('authToken');
      window.location.href = '/';
    }

    return Promise.reject(error);
  }
);
