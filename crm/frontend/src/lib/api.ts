import axios, { AxiosInstance } from 'axios';
import Cookies from 'js-cookie';

const ACCESS_TOKEN_KEY  = 'crm_access_token';
const REFRESH_TOKEN_KEY = 'crm_refresh_token';

export const api: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Attach access token ───────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = Cookies.get(ACCESS_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auto-refresh on 401 ───────────────────────────────────────────────────────
let isRefreshing = false;
let queue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    original._retry = true;

    const refreshToken = Cookies.get(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      clearAuth();
      window.location.href = '/auth/login';
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push((token: string) => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(api(original));
        });
      });
    }

    isRefreshing = true;
    try {
      const { data } = await axios.post('/api/auth/refresh', { refreshToken });
      const { accessToken, refreshToken: newRefresh } = data.data;
      setAuth(accessToken, newRefresh);
      queue.forEach((cb) => cb(accessToken));
      queue = [];
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch {
      clearAuth();
      window.location.href = '/auth/login';
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);

export function setAuth(accessToken: string, refreshToken: string): void {
  Cookies.set(ACCESS_TOKEN_KEY, accessToken, { expires: 1, secure: window.location.protocol === 'https:' });
  Cookies.set(REFRESH_TOKEN_KEY, refreshToken, { expires: 7, secure: window.location.protocol === 'https:' });
}

export function clearAuth(): void {
  Cookies.remove(ACCESS_TOKEN_KEY);
  Cookies.remove(REFRESH_TOKEN_KEY);
}

export function getAccessToken(): string | undefined {
  return Cookies.get(ACCESS_TOKEN_KEY);
}
