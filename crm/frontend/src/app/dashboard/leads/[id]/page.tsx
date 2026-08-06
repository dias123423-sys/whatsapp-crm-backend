'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useParams } from 'next/navigation';
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Phone, User, MessageSquare, Clock, ChevronLeft, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { LeadStatus } from '@/types';

const STATUS_OPTIONS: LeadStatus[] = ['NEW', 'CALLING', 'BOOKED', 'FOLLOW_UP', 'NO_ANSWER', 'CLOSED'];

export default function LeadDetailPage() {
  const { id }     = useParams<{ id: string }>();
  const qc         = useQueryClient();
  const [note, setNote] = useState('');

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: async () => { const r = await api.get(`/api/leads/${id}`); return r.data.data; },
  });

  const statusMut = useMutation({
    mutationFn: (status: LeadStatus) => api.patch(`/api/leads/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead', id] }); toast.success('Статус обновлён'); },
  });

  const noteMut = useMutation({
    mutationFn: (body: string) => api.post(`/api/leads/${id}/notes`, { body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead', id] }); setNote(''); toast.success('Заметка добавлена'); },
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  );

  if (!lead) return <div className="p-6 text-gray-500">Лид не найден</div>;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/leads" className="text-gray-400 hover:text-gray-700"><ChevronLeft size={20} /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900">
              {lead.client.waName ?? lead.client.phone}
              {lead.client.isVip && <span className="ml-2 text-yellow-500">⭐ VIP</span>}
            </h1>
            <LeadStatusBadge status={lead.status} />
          </div>
          <p className="text-sm text-gray-500">{lead.client.phone} · {lead.waAccountId}</p>
        </div>
        {/* Status selector */}
        <select
          className="select w-40"
          value={lead.status}
          onChange={(e) => statusMut.mutate(e.target.value as LeadStatus)}
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-4">

          {/* First message */}
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <MessageSquare size={16} /> Первое сообщение
            </h2>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 leading-relaxed">
              {lead.firstMessage}
            </p>
            <div className="mt-2 flex gap-4 text-xs text-gray-400">
              <span>Кампания: <strong className="text-gray-600">{lead.campaign?.name ?? '—'}</strong></span>
              <span>Реклама: <strong className="text-gray-600">{lead.ad?.name ?? '—'}</strong></span>
              <span>Уверенность: <strong className="text-gray-600">{Math.round((lead.confidence ?? 0) * 100)}%</strong></span>
            </div>
          </div>

          {/* Timeline */}
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Clock size={16} /> История статусов
            </h2>
            <div className="space-y-2">
              {lead.statusHistory?.map((h: { id: string; toStatus: string; fromStatus?: string; createdAt: string; note?: string }) => (
                <div key={h.id} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{h.fromStatus ? `${h.fromStatus} → ` : ''}{h.toStatus}</span>
                    {h.note && <p className="text-gray-500 text-xs">{h.note}</p>}
                    <p className="text-xs text-gray-400">{format(new Date(h.createdAt), 'dd.MM.yyyy HH:mm', { locale: ru })}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-3">Заметки</h2>
            <div className="space-y-3 mb-4">
              {lead.notes?.map((n: { id: string; body: string; createdAt: string; operator: { user: { firstName: string; lastName: string } } }) => (
                <div key={n.id} className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                  <p className="text-sm text-gray-800">{n.body}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {n.operator.user.firstName} {n.operator.user.lastName} · {format(new Date(n.createdAt), 'dd.MM HH:mm')}
                  </p>
                </div>
              ))}
              {!lead.notes?.length && <p className="text-sm text-gray-400">Заметок нет</p>}
            </div>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="Добавить заметку..."
                value={note} onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) noteMut.mutate(note.trim()); }} />
              <button onClick={() => note.trim() && noteMut.mutate(note.trim())}
                disabled={!note.trim() || noteMut.isPending}
                className="btn-primary px-3">
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Right: info panel */}
        <div className="space-y-4">
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-800">Информация</h2>
            <div className="space-y-2 text-sm">
              <Row label="Процедура"   value={lead.procedure?.name} />
              <Row label="Оператор"    value={lead.operator ? `${lead.operator.user.firstName} ${lead.operator.user.lastName}` : 'Не назначен'} />
              <Row label="Источник"    value={lead.campaign?.source ?? '—'} />
              <Row label="WA аккаунт" value={lead.waAccountId} />
              <Row label="Создан"     value={format(new Date(lead.createdAt), 'dd.MM.yyyy HH:mm', { locale: ru })} />
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-800">Клиент</h2>
            <div className="space-y-2 text-sm">
              <Row label="Телефон" value={lead.client.phone} />
              <Row label="Имя WA"  value={lead.client.waName ?? '—'} />
              <Row label="VIP"     value={lead.client.isVip ? '⭐ Да' : 'Нет'} />
            </div>
            <a href={`tel:${lead.client.phone}`} className="btn-primary w-full justify-center mt-2">
              <Phone size={14} />
              Позвонить
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-right">{value ?? '—'}</span>
    </div>
  );
}
