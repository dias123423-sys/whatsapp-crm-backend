'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Lead, LeadStatus, PaginatedResult } from '@/types';
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Phone, MessageSquare, ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const MY_STATUSES: { value: LeadStatus | ''; label: string }[] = [
  { value: '',           label: 'Все' },
  { value: 'NEW',        label: '🟢 Новые' },
  { value: 'CALLING',    label: '📞 Звонок' },
  { value: 'FOLLOW_UP',  label: '🔔 Перезвон' },
  { value: 'NO_ANSWER',  label: '❌ Нет ответа' },
  { value: 'BOOKED',     label: '✅ Записан' },
  { value: 'CLOSED',     label: '⛔ Закрыт' },
];

export default function OperatorLeadsPage() {
  const qc    = useQueryClient();
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);

  const { data, isLoading } = useQuery<PaginatedResult<Lead>>({
    queryKey: ['my-leads', status, search, page],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: '25' });
      if (status) p.set('status', status);
      if (search) p.set('search', search);
      const r = await api.get(`/api/leads?${p}`);
      return r.data.data;
    },
    refetchInterval: 15_000,
  });

  const changeMut = useMutation({
    mutationFn: ({ id, s }: { id: string; s: LeadStatus }) =>
      api.patch(`/api/leads/${id}/status`, { status: s }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-leads'] }); toast.success('Обновлено'); },
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Мои лиды</h1>
        <p className="text-sm text-gray-500">{data?.total ?? 0} лидов</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 text-sm" placeholder="Телефон, имя..."
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {MY_STATUSES.map(({ value, label }) => (
            <button key={value} onClick={() => { setStatus(value); setPage(1); }}
              className={clsx('text-xs px-3 py-1.5 rounded-full border transition-colors',
                status === value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              )}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lead cards */}
      <div className="space-y-2">
        {isLoading ? Array.from({length:5}).map((_,i) => (
          <div key={i} className="card animate-pulse h-20" />
        )) : data?.data.length === 0 ? (
          <div className="card py-16 text-center">
            <Phone size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-gray-400">Лидов нет</p>
          </div>
        ) : data?.data.map((lead) => (
          <div key={lead.id} className="card p-3 flex items-center gap-3 hover:shadow-md transition-shadow">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 flex-shrink-0 text-sm">
              {lead.client.waName?.[0]?.toUpperCase() ?? '#'}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{lead.client.waName ?? lead.client.phone}</span>
                {lead.client.isVip && <span className="text-yellow-500 text-xs">⭐</span>}
                <LeadStatusBadge status={lead.status} />
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">{lead.firstMessage.slice(0, 80)}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                <span>{lead.procedure?.name ?? '—'}</span>
                <span>·</span>
                <span>{format(new Date(lead.createdAt), 'dd.MM HH:mm')}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <a href={`tel:${lead.client.phone}`}
                className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center hover:bg-green-200 transition-colors">
                <Phone size={14} />
              </a>

              <select
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={lead.status}
                onChange={(e) => changeMut.mutate({ id: lead.id, s: e.target.value as LeadStatus })}
              >
                {MY_STATUSES.filter(s => s.value).map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>

              <Link href={`/dashboard/leads/${lead.id}`}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 transition-colors">
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p-1)} className="btn-secondary py-1 px-3 text-xs disabled:opacity-40">← Назад</button>
          <span className="text-xs text-gray-500 self-center">{page} / {data.totalPages}</span>
          <button disabled={page >= data.totalPages} onClick={() => setPage(p => p+1)} className="btn-secondary py-1 px-3 text-xs disabled:opacity-40">Вперёд →</button>
        </div>
      )}
    </div>
  );
}
