'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Users, Phone, Target, Stethoscope,
  BarChart2, Settings, LogOut, GitBranch, Zap,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { clearAuth } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { disconnectSocket } from '@/lib/socket';

const ADMIN_NAV = [
  { href: '/dashboard',             label: 'Дашборд',     icon: LayoutDashboard },
  { href: '/dashboard/leads',       label: 'Лиды',        icon: Phone },
  { href: '/dashboard/operators',   label: 'Операторы',   icon: Users },
  { href: '/dashboard/campaigns',   label: 'Кампании',    icon: Target },
  { href: '/dashboard/procedures',  label: 'Процедуры',   icon: Stethoscope },
  { href: '/dashboard/reports',     label: 'Отчёты',      icon: BarChart2 },
  { href: '/dashboard/settings',    label: 'Настройки',   icon: Settings },
];

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500', CALLING: 'bg-yellow-500', BOOKED: 'bg-green-500',
  FOLLOW_UP: 'bg-purple-500', NO_ANSWER: 'bg-red-500',
};

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, setUser } = useAuthStore();

  function logout() {
    clearAuth();
    disconnectSocket();
    setUser(null);
    router.push('/auth/login');
  }

  return (
    <aside className="w-60 min-h-screen bg-white border-r border-gray-100 flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-gray-100">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <Zap size={16} className="text-white" />
        </div>
        <span className="font-bold text-gray-900 text-sm">WhatsApp CRM</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'sidebar-link',
              pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                ? 'active' : '',
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-2 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
            {user?.email?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{user?.email}</p>
            <p className="text-xs text-gray-400">{user?.role}</p>
          </div>
        </div>
        <button onClick={logout} className="sidebar-link w-full text-red-500 hover:text-red-600 hover:bg-red-50">
          <LogOut size={16} />
          Выйти
        </button>
      </div>
    </aside>
  );
}
