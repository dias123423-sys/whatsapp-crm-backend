'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Users, TrendingUp, Phone } from 'lucide-react';
import { clsx } from 'clsx';

interface KpiRow { operatorId: string; name: string; totalLeads: number; booked: number; calls: number; conversion: number; }

export default function OperatorsPage() {
  const { data: operators = [], isLoading } = useQuery({
    queryKey: ['operators'],
    queryFn: async () => { const r = await api.get('/api/operators'); return r.data.data; },
  });

  const { data: kpi = [] } = useQuery<KpiRow[]>({
    queryKey: ['operators-kpi'],
    queryFn: async () => { const r = await api.get('/api/operators/kpi'); return r.data.data; },
  });

  const kpiMap = new Map(kpi.map((k) => [k.operatorId, k]));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Операторы</h1>
          <p className="text-sm text-gray-500">KPI за текущий месяц</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card animate-pulse h-40" />
        )) : operators.map((op: { id: string; displayName: string; isOnline: boolean; isAvailable: boolean; user: { firstName: string; lastName: string; email: string }; branch?: { name: string }; skills: string[] }) => {
          const k = kpiMap.get(op.id);
          return (
            <div key={op.id} className="card space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">
                  {op.user.firstName[0]}{op.user.lastName[0]}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{op.user.firstName} {op.user.lastName}</p>
                  <p className="text-xs text-gray-400">{op.user.email}</p>
                </div>
                <span className={clsx('status-dot', op.isOnline ? 'bg-green-500' : 'bg-gray-300')} />
              </div>

              {op.branch && <p className="text-xs text-gray-500">📍 {op.branch.name}</p>}
              {op.skills?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {op.skills.map((s: string) => (
                    <span key={s} className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-center">
                <div>
                  <p className="text-lg font-bold text-gray-900">{k?.totalLeads ?? 0}</p>
                  <p className="text-xs text-gray-400">Лидов</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-green-600">{k?.booked ?? 0}</p>
                  <p className="text-xs text-gray-400">Записей</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-purple-600">{k?.conversion ?? 0}%</p>
                  <p className="text-xs text-gray-400">Конверсия</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
interface KpiRow { operatorId: string; name: string; totalLeads: number; booked: number; calls: number; conversion: number; }

export default function OperatorsPage() {
  const { data: operators = [], isLoading } = useQuery({
    queryKey: ['operators'],
    queryFn: async () => { const r = await api.get('/api/operators'); return r.data.data; },
  });

  const { data: kpi = [] } = useQuery<KpiRow[]>({
    queryKey: ['operators-kpi'],
    queryFn: async () => { const r = await api.get('/api/operators/kpi'); return r.data.data; },
  });

  const kpiMap = new Map(kpi.map((k) => [k.operatorId, k]));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Операторы</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card animate-pulse h-40" />
        )) : operators.map((op: { id: string; user: { firstName: string; lastName: string; email: string }; isOnline: boolean; branch?: { name: string }; skills: string[] }) => {
          const k = kpiMap.get(op.id);
          return (
            <div key={op.id} className="card space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">
                  {op.user.firstName[0]}{op.user.lastName[0]}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{op.user.firstName} {op.user.lastName}</p>
                  <p className="text-xs text-gray-400">{op.user.email}</p>
                </div>
                <span className={clsx('status-dot', op.isOnline ? 'bg-green-500' : 'bg-gray-300')} />
              </div>
              {op.branch && <p className="text-xs text-gray-500">📍 {op.branch.name}</p>}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-center">
                <div>
                  <p className="text-lg font-bold">{k?.totalLeads ?? 0}</p>
                  <p className="text-xs text-gray-400">Лидов</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-green-600">{k?.booked ?? 0}</p>
                  <p className="text-xs text-gray-400">Записей</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-purple-600">{k?.conversion ?? 0}%</p>
                  <p className="text-xs text-gray-400">Конверсия</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
