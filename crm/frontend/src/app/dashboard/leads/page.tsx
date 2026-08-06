'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Lead, PaginatedResult, LeadStatus } from '@/types';
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge';
import { format } from 'date-fns';
import { Phone, Search, Filter, RefreshCw, User } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { clsx } from 'clsx';

const STATUSES: { value: LeadStatus | ''; label: string }[] = [
  { value: '',           label: 'Все статусы' },
  { value: 'NEW',        label: '🟢 Новые' },
  { value: 'CALLING',    label: '📞 Звонок' },
  { value: 'BOOKED',     label: '✅ Записан' },
  { value: 'FOLLOW_UP',  label: '🔔 Перезвон' },
  { value: 'NO_ANSWER',  label: '❌ Нет ответа' },
  { value: 'CLOSED',     label: '⛔ Закрыт' },
  { value: 'DUPLICATE',  label: '🔁 Дубликат' },
];

export default function LeadsPage() {
  const qc = useQueryClient();
  const [search, setSearch]   = useState('');
  const [status, setStatus]   = useState<LeadStatus | ''>('');
  const [page, setPage]       = useState(1);

  const { data, isLoading, refetch } = useQuery<PaginatedResult<Lead>>({
    queryKey: ['leads', { search, status, page }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const res = await api.get(`/api/leads?${params}`);
      return res.data.data;
    },
  });

  const changeStatusMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: LeadStatus }) =>
      api.patch(`/api/leads/${id}/status`, { status: newStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Статус обновлён');
    },
    onError: () => toast.error('Ошибка при обновлении'),
  });

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Лиды</h1>
          {data && <p className="text-sm text-gray-500">Всего: {data.total}</p>}
        </div>
        <button onClick={() => void refetch()} className="btn-secondary">
          <RefreshCw size={14} />
          Обновить
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8" placeholder="Поиск по телефону, имени..."
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="select w-auto" value={status} onChange={(e) => { setStatus(e.target.value as LeadStatus | ''); setPage(1); }}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Клиент', 'Телефон', 'Процедура', 'Кампания', 'Оператор', 'Статус', 'Создан', ''].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : data?.data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-400">
                    <Phone size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Лидов не найдено</p>
                  </td>
                </tr>
              ) : (
                data?.data.map((lead) => (
                  <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {lead.client.isVip && <span title="VIP" className="text-yellow-500 text-xs">⭐</span>}
                        <span className="font-medium">{lead.client.waName ?? '—'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-600">{lead.client.phone}</td>
                    <td className="py-3 px-4">
                      {lead.procedure ? (
                        <span className="badge" style={{ background: lead.procedure.color + '20', color: lead.procedure.color }}>
                          {lead.procedure.name}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-xs">{lead.campaign?.name ?? '—'}</td>
                    <td className="py-3 px-4">
                      {lead.operator ? (
                        <div className="flex items-center gap-1.5">
                          <User size={13} className="text-gray-400" />
                          <span className="text-xs">{lead.operator.user.firstName} {lead.operator.user.lastName}</span>
                        </div>
                      ) : <span className="text-xs text-gray-400">Не назначен</span>}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        className={clsx('text-xs rounded-full px-2 py-0.5 border-0 font-medium cursor-pointer focus:outline-none', `status-${lead.status}`)}
                        value={lead.status}
                        onChange={(e) => changeStatusMutation.mutate({ id: lead.id, newStatus: e.target.value as LeadStatus })}
                      >
                        {STATUSES.filter(s => s.value).map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                      {format(new Date(lead.createdAt), 'dd.MM HH:mm')}
                    </td>
                    <td className="py-3 px-4">
                      <Link href={`/dashboard/leads/${lead.id}`}
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                        Открыть →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Страница {data.page} из {data.totalPages} · {data.total} лидов
            </p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="btn-secondary py-1 px-2 text-xs disabled:opacity-40">← Назад</button>
              <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}
                className="btn-secondary py-1 px-2 text-xs disabled:opacity-40">Вперёд →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
