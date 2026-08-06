import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Phone, ChevronRight, RefreshCw, Clock } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { leadsApi } from '../api';

dayjs.locale('ru');

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  NEW: { label: 'Новый', className: 'bg-blue-100 text-blue-700' },
  CALLING: { label: 'Звонок', className: 'bg-yellow-100 text-yellow-700' },
  BOOKED: { label: 'Записан', className: 'bg-green-100 text-green-700' },
  FOLLOW_UP: { label: 'Перезвонить', className: 'bg-purple-100 text-purple-700' },
  NO_ANSWER: { label: 'Не отвечает', className: 'bg-gray-100 text-gray-600' },
  CLOSED: { label: 'Закрыт', className: 'bg-red-100 text-red-700' },
};

const FILTER_TABS = [
  { value: '', label: 'Все' },
  { value: 'NEW', label: 'Новые' },
  { value: 'CALLING', label: 'Звонок' },
  { value: 'FOLLOW_UP', label: 'Перезвонить' },
  { value: 'BOOKED', label: 'Записан' },
];

export default function LeadsListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-leads', statusFilter],
    queryFn: () => leadsApi.getMyLeads({ status: statusFilter || undefined, take: 100 }),
    refetchInterval: 30_000,
  });

  const leads = data?.data || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Мои клиенты</h1>
          <p className="text-gray-500 text-sm">
            {data?.total ?? 0} лидов
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary py-1.5 px-3">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              statusFilter === tab.value
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-48" />
            </div>
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="card p-12 text-center">
          <Phone size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Нет клиентов</p>
          <p className="text-gray-400 text-sm mt-1">
            {statusFilter ? 'Нет лидов с таким статусом' : 'Новые клиенты появятся здесь'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {leads.map((lead: any, idx: number) => {
            const cfg = STATUS_CONFIG[lead.status] || { label: lead.status, className: 'bg-gray-100 text-gray-600' };
            return (
              <button
                key={lead.id}
                onClick={() => navigate(`/leads/${lead.id}`)}
                className="card w-full p-4 text-left hover:shadow-md transition-shadow active:scale-[0.99]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Number */}
                    <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                      {idx + 1}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">
                          {lead.client?.name || 'Клиент'}
                        </p>
                        <span className={`badge ${cfg.className}`}>{cfg.label}</span>
                      </div>
                      <p className="text-sm text-gray-500 font-mono mt-0.5">{lead.client?.phone}</p>
                      {lead.procedure && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {lead.procedure.name} — {lead.price?.toLocaleString() || lead.procedure.price?.toLocaleString()} ₸
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-gray-400 text-xs justify-end">
                        <Clock size={11} />
                        {dayjs(lead.createdAt).format('HH:mm')}
                      </div>
                      <p className="text-xs text-gray-400">
                        {dayjs(lead.createdAt).format('DD.MM')}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
