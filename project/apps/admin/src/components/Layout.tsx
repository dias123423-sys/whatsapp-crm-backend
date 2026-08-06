import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  MessageSquare,
  Stethoscope,
  FileSpreadsheet,
  Settings,
  LogOut,
  Phone,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Дашборд' },
  { to: '/leads', icon: Users, label: 'Лиды' },
  { to: '/operators', icon: UserCheck, label: 'Операторы' },
  { to: '/whatsapp', icon: MessageSquare, label: 'WhatsApp' },
  { to: '/procedures', icon: Stethoscope, label: 'Процедуры' },
  { to: '/reports', icon: FileSpreadsheet, label: 'Отчёты' },
  { to: '/settings', icon: Settings, label: 'Настройки' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <Phone size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Call Center</p>
              <p className="text-gray-400 text-xs">Админ панель</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-gray-700">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
              {user?.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className="text-gray-400 text-xs truncate">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-white transition">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
