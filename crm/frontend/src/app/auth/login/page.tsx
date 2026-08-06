'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAuth } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      const { accessToken, refreshToken } = data.data;
      setAuth(accessToken, refreshToken);

      const me = await api.get('/api/auth/me');
      setUser(me.data.data);

      const role = me.data.data.role;
      if (role === 'OPERATOR') router.push('/operator');
      else router.push('/dashboard');
    } catch {
      toast.error('Неверный email или пароль');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <span className="text-3xl">💬</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Lead CRM</h1>
          <p className="text-gray-500 mt-1 text-sm">Система управления лидами</p>
        </div>

        <div className="card shadow-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="input" placeholder="admin@clinic.kz"
                value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
              <input type="password" className="input" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-2">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Вход...
                </span>
              ) : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
