'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatsCard } from '@/components/ui/StatsCard';
import { Phone, CheckCircle, XCircle, RefreshCw, TrendingUp, Users, AlertTriangle } from 'lucide-react';
import { DashboardStats, Lead } from '@/types';
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await api.get('/api/leads/stats');
      return res.data.data;
    },
    refetchInterval: 30_000,
  });

  const { data: recentLeads } = useQuery<{ data: Lead[] }>({
    queryKey: ['leads', 'recent'],
    queryFn: async () => {
      const res = await api.get('/api/leads?limit=10&page=1');
      return res.data.data;
    },
    refetchInterval: 20_000,
  });

  const statusCounts = (status: string) =>
    stats?.byStatus.find((s) => s.status === status)?._count._all ?? 0;

  const chartData = [
    { name: 'Новые',    value: statusCounts('NEW'),       fill: '#3B82F6' },
    { name: 'Звонок',   value: statusCounts('CALLING'),   fill: '#EAB308' },
    { name: 'Записаны', value: statusCounts('BOOKED'),    fill: '#22C55E' },
    { name: 'Перезвон', value: statusCounts('FOLLOW_UP'), fill: '#A855F7' },
    { name: 'Нет отв.', value: statusCounts('NO_ANSWER'), fill: '#EF4444' },
    { name: 'Закрыты',  value: statusCounts('CLOSED'),    fill: '#6B7280' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Дашборд</h1>
          <p className="text-sm text-gray-500">{format(new Date(), 'dd MMMM yyyy', { locale: ru })}</p>
        </div>
        <Link href="/dashboard/leads" className="btn-primary">
          <Phone size={16} />
          Все лиды
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Всего лидов"     value={stats?.total ?? 0}           icon={<Phone size={18} />}         color="blue"   loading={statsLoading} />
        <StatsCard title="Записаны"         value={statusCounts('BOOKED')}       icon={<CheckCircle size={18} />}   color="green"  loading={statsLoading} />
        <StatsCard title="Нет ответа"       value={statusCounts('NO_ANSWER')}    icon={<XCircle size={18} />}       color="red"    loading={statsLoading} />
        <StatsCard title="Конверсия"        value={`${stats?.conversion ?? 0}%`} icon={<TrendingUp size={18} />}    color="purple" loading={statsLoading}
          subtitle="записаны / всего" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Звонки"   value={statusCounts('CALLING')}   icon={<RefreshCw size={18} />}       color="yellow" loading={statsLoading} />
        <StatsCard title="Перезвон" value={statusCounts('FOLLOW_UP')} icon={<AlertTriangle size={18} />}   color="orange" loading={statsLoading} />
        <StatsCard title="Дубликаты" value={stats?.byStatus.find(s => s.status === 'DUPLICATE')?._count._all ?? 0}
          icon={<RefreshCw size={18} />} color="orange" loading={statsLoading} />
        <StatsCard title="Операторы" value={stats?.byOperator.length ?? 0} icon={<Users size={18} />} color="blue" loading={statsLoading} />
      </div>

      {/* Chart + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Лиды по статусам</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent leads */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Последние лиды</h2>
            <Link href="/dashboard/leads" className="text-xs text-blue-600 hover:underline">Все →</Link>
          </div>
          <div className="space-y-2">
            {recentLeads?.data?.slice(0, 6).map((lead) => (
              <Link key={lead.id} href={`/dashboard/leads/${lead.id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
                  {lead.client.waName?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {lead.client.waName ?? lead.client.phone}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{lead.procedure?.name ?? '—'}</p>
                </div>
                <div className="flex-shrink-0">
                  <LeadStatusBadge status={lead.status} />
                </div>
              </Link>
            ))}
            {!recentLeads?.data?.length && (
              <p className="text-center text-gray-400 text-sm py-8">Лидов пока нет</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
