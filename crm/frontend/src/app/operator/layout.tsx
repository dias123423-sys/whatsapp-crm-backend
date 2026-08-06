'use client';
import { useAuthStore } from '@/stores/auth.store';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { clearAuth } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { Phone, BarChart2, LogOut, Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuthStore();
  const router = useRouter();
  const qc     = useQueryClient();
  const path   = usePathname();

  useEffect(() => {
    if (!user) router.push('/auth/login');
  }, [user, router]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('operator:online');

    socket.on('lead:assigned', (lead: { procedure?: { name: string } }) => {
      qc.invalidateQueries({ queryKey: ['my-leads'] });
      toast.success(`📞 Новый лид: ${lead.procedure?.name ?? 'входящий'}`, { duration: 8000 });
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Новый лид!', { body: `Процедура: ${lead.procedure?.name ?? '—'}` });
      }
    });

    socket.on('lead:status_changed', () => qc.invalidateQueries({ queryKey: ['my-leads'] }));

    return () => { socket.off('lead:assigned'); socket.off('lead:status_changed'); };
  }, [qc]);

  function logout() { clearAuth(); disconnectSocket(); setUser(null); router.push('/auth/login'); }

  if (!user) return null;

  const nav = [
    { href: '/operator',       label: 'Мои лиды', icon: Phone },
    { href: '/operator/stats', label: 'Статистика', icon: BarChart2 },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="w-52 min-h-screen bg-white border-r border-gray-100 flex flex-col">
        <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-100">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-bold text-sm text-gray-900">WhatsApp CRM</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={clsx('sidebar-link', path === href ? 'active' : '')}>
              <Icon size={16} />{label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-gray-900 truncate">{user.email}</p>
            <p className="text-xs text-gray-400">Оператор</p>
          </div>
          <button onClick={logout} className="sidebar-link w-full text-red-500 hover:text-red-600 hover:bg-red-50">
            <LogOut size={14} />Выйти
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
