'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Cookies from 'js-cookie';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await api.post('/api/auth/login', { username, password });
      const { token } = res.data;

      // secure only on HTTPS — otherwise cookie won't stick on localhost
      Cookies.set('authToken', token, {
        expires: 7,
        secure: window.location.protocol === 'https:',
        sameSite: 'lax',
      });
      toast.success('Добро пожаловать!');
      router.push('/dashboard');
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      const offline = !apiErr.response;
      toast.error(
        offline
          ? 'Сервер недоступен. Проверьте подключение к интернету.'
          : apiErr.response?.data?.message || 'Неверный логин или пароль'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg mb-4">
            <span className="text-3xl">💬</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Appointments</h1>
          <p className="text-gray-500 mt-1">Система управления записями</p>
        </div>

        {/* Form */}
        <div className="card shadow-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Логин
              </label>
              <input
                type="text"
                className="input"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Пароль
              </label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Вход...
                </span>
              ) : (
                'Войти'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          WhatsApp Appointment System v1.0
        </p>
      </div>
    </div>
  );
}
