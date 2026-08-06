'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { AppointmentFilters } from '@/types';
import { StatsOverview } from '@/components/StatsOverview';
import { AppointmentsTable } from '@/components/AppointmentsTable';
import { WhatsAppPanel } from '@/components/WhatsAppPanel';
import Cookies from 'js-cookie';
import { LogOut, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [filters, setFilters] = useState<AppointmentFilters>({
    page: 1,
    limit: 50,
  });

  // Initialize socket connection
  const socket = useSocket();

  useEffect(() => {
    setIsConnected(socket.connected);
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, [socket]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['appointments', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.whatsappAccount) params.set('whatsappAccount', filters.whatsappAccount);
      if (filters.createdBy) params.set('createdBy', filters.createdBy);
      params.set('page', String(filters.page || 1));
      params.set('limit', String(filters.limit || 50));

      const res = await api.get(`/api/appointments?${params}`);
      return res.data;
    },
    refetchInterval: 60000,
  });

  const handleFiltersChange = (newFilters: Partial<AppointmentFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleLogout = () => {
    Cookies.remove('authToken');
    router.push('/');
    toast.success('Вы вышли из системы');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-base">💬</span>
            </div>
            <h1 className="font-semibold text-gray-900 hidden sm:block">
              WhatsApp Appointments
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Realtime indicator */}
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`status-dot ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}
              />
              <span className={isConnected ? 'text-emerald-600' : 'text-gray-400'}>
                {isConnected ? 'Realtime' : 'Offline'}
              </span>
            </div>

            <button
              onClick={() => refetch()}
              className="btn-secondary py-1.5 px-3 text-sm"
              title="Обновить"
            >
              <RefreshCw size={14} />
            </button>

            <button
              onClick={handleLogout}
              className="btn-secondary py-1.5 px-3 text-sm text-red-500 hover:text-red-600"
            >
              <LogOut size={14} />
              <span className="hidden sm:block">Выйти</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats cards */}
        <StatsOverview
          activeCreatedBy={filters.createdBy || ''}
          onFilterByCreatedBy={(createdBy) =>
            setFilters((prev) => ({ ...prev, createdBy: createdBy || undefined, page: 1 }))
          }
        />

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Appointments table — takes 3/4 width */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800">
                {filters.createdBy === 'BOT'
                  ? 'BOT записи'
                  : filters.createdBy === 'OPERATOR'
                    ? 'OPERATOR записи'
                    : 'Все записи'}
                {data?.total !== undefined && (
                  <span className="ml-2 text-sm text-gray-400 font-normal">
                    ({data.total})
                  </span>
                )}
              </h2>
            </div>
            <AppointmentsTable
              appointments={data?.data || []}
              total={data?.total || 0}
              page={data?.page || 1}
              totalPages={data?.totalPages || 1}
              loading={isLoading}
              filters={filters}
              onFiltersChange={handleFiltersChange}
            />
          </div>

          {/* WhatsApp panel — takes 1/4 width */}
          <div className="lg:col-span-1">
            <div className="mb-3">
              <h2 className="font-semibold text-gray-800">Статус WhatsApp</h2>
            </div>
            <WhatsAppPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
