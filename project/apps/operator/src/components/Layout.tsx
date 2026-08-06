import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Phone, Users, LogOut, Bell } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [newLeadCount, setNewLeadCount] = useState(0);

  useEffect(() => {
    const socket = io('/notifications', {
      auth: { token: localStorage.getItem('op_token') },
    });

    socket.on('connect', () => {
      socket.emit('join_operator');
    });

    socket.on('new_lead', (lead) => {
      setNewLeadCount((c) => c + 1);
      toast.success(`Новый клиент: ${lead.client?.name || lead.client?.phone}`, {
        duration: 5000,
        icon: '📱',
      });
    });

    return () => { socket.disconnect(); };
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Phone size={15} className="text-white" />
            </div>
            <span className="font-semibold text-gray-900">Оператор</span>
          </div>

          <nav className="flex items-center gap-1">
            <NavLink
              to="/leads"
              onClick={() => setNewLeadCount(0)}
              className={({ isActive }) =>
                `relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <Users size={15} />
              Мои лиды
              {newLeadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {newLeadCount > 9 ? '9+' : newLeadCount}
                </span>
              )}
            </NavLink>
          </nav>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-gray-700 transition">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
