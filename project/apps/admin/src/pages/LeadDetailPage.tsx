import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Phone, User, Calendar, MessageSquare, Clock } from 'lucide-react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { leadsApi } from '../api/leads';
import { operatorsApi } from '../api/operators';
import StatusBadge from '../components/StatusBadge';

const STATUSES = ['NEW', 'CALLING', 'BOOKED', 'FOLLOW_UP', 'NO_ANSWER', 'CLOSED'];

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.getById(id!),
  });

  const { data: operators } = useQuery({
    queryKey: ['operators'],
    queryFn: operatorsApi.getAll,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => leadsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      toast.success('Сохранено');
    },
    onError: () => toast.error('Ошибка'),
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="card p-6 space-y-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-5 bg-gray-100 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!lead) return null;

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-5 transition text-sm">
        <ArrowLeft size={16} />
        Назад
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {lead.client?.name || lead.client?.phone}
        </h1>
        <StatusBadge status={lead.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client Info */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Информация о клиенте</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: User, label: 'Имя', value: lead.client?.name || '—' },
                { icon: Phone, label: 'Телефон', value: lead.client?.phone },
                { icon: MessageSquare, label: 'Процедура', value: lead.procedure?.name || '—' },
                { icon: Clock, label: 'Цена', value: lead.price ? `${lead.price.toLocaleString()} ₸` : '—' },
                { icon: Calendar, label: 'Источник', value: lead.source },
                { icon: Calendar, label: 'Дата', value: dayjs(lead.createdAt).format('DD.MM.YYYY HH:mm') },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon size={14} className="text-gray-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-sm font-medium text-gray-900">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* History */}
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">История</h2>
            {lead.history?.length === 0 ? (
              <p className="text-gray-400 text-sm">Нет событий</p>
            ) : (
              <div className="space-y-3">
                {lead.history?.map((h: any) => (
                  <div key={h.id} className="flex gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-gray-900">{h.event}</p>
                      {h.details && <p className="text-xs text-gray-500 mt-0.5">{h.details}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {dayjs(h.createdAt).format('DD.MM.YYYY HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Edit Panel */}
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Управление</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Статус</label>
                <select
                  className="input text-sm"
                  value={lead.status}
                  onChange={(e) => updateMutation.mutate({ status: e.target.value })}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Оператор</label>
                <select
                  className="input text-sm"
                  value={lead.operatorId || ''}
                  onChange={(e) => updateMutation.mutate({ operatorId: e.target.value || null })}
                >
                  <option value="">Не назначен</option>
                  {operators?.map((op: any) => (
                    <option key={op.id} value={op.id}>{op.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Комментарий</label>
                <textarea
                  className="input text-sm resize-none"
                  rows={3}
                  defaultValue={lead.comment || ''}
                  onBlur={(e) => {
                    if (e.target.value !== (lead.comment || '')) {
                      updateMutation.mutate({ comment: e.target.value });
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Calls */}
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Звонки</h2>
            {lead.calls?.length === 0 ? (
              <p className="text-gray-400 text-sm">Нет звонков</p>
            ) : (
              <div className="space-y-2">
                {lead.calls?.map((c: any) => (
                  <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{dayjs(c.calledAt).format('DD.MM.YYYY HH:mm')}</p>
                    {c.result && <p className="text-sm text-gray-700 mt-0.5">{c.result}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
