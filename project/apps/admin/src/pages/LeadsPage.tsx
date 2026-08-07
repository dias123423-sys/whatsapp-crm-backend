import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { leadsApi } from '../api/leads';
import { operatorsApi } from '../api/operators';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import { useSse } from '../hooks/useSse';

const STATUSES = ['', 'NEW', 'CALLING', 'BOOKED', 'FOLLOW_UP', 'NO_ANSWER', 'CLOSED'];
const PAGE_SIZE = 20;

export default function LeadsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);

  // Send-to-operator modal
  const [sendModal, setSendModal] = useState<any>(null);
  const [selectedOperatorId, setSelectedOperatorId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['leads', search, status, page],
    queryFn: () =>
      leadsApi.getAll({
        search: search || undefined,
        status: status || undefined,
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    placeholderData: (prev: any) => prev,
  } as any);

  const { data: operators } = useQuery({
    queryKey: ['operators'],
    queryFn: operatorsApi.getAll,
  });

  // Real-time: when a new lead arrives via SSE, invalidate the leads list
  // so the table refreshes automatically (only when on page 0 with no filters)
  useSse({
    onNewLead: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      // Small toast so the operator knows something arrived
      if (page === 0 && !search && !status) {
        toast('📱 Новый лид', { duration: 2500 });
      }
    },
    onLeadUpdated: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, operatorId }: any) =>
      leadsApi.update(id, { operatorId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setSendModal(null);
      setSelectedOperatorId('');
      toast.success('Клиент отправлен оператору');
    },
    onError: () => toast.error('Ошибка'),
  });

  function openSend(lead: any) {
    setSendModal(lead);
    setSelectedOperatorId(lead.operatorId || '');
  }

  const leads = (data as any)?.data || [];
  const total = (data as any)?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Лиды</h1>
          <p className="text-gray-500 text-sm mt-0.5">Всего: {total}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Поиск по телефону или имени..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <select
          className="input w-44"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s || 'Все статусы'}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Телефон</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Имя</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Процедура</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Цена</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Оператор</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Дата</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Действия</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? [...Array(6)].map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : leads.length === 0
                ? (
                    <tr>
                      <td colSpan={8} className="text-center py-14 text-gray-400">
                        Лиды не найдены
                      </td>
                    </tr>
                  )
                : leads.map((lead: any) => (
                    <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-mono text-gray-700 text-xs">{lead.client?.phone}</td>
                      <td className="px-4 py-3 text-gray-900">{lead.client?.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{lead.procedure?.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {lead.price ? `${Number(lead.price).toLocaleString()} ₸` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {lead.operator
                          ? <span className="text-gray-800 text-xs font-medium">{lead.operator.name}</span>
                          : <span className="text-gray-400 text-xs">Не назначен</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={lead.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {dayjs(lead.createdAt).format('DD.MM HH:mm')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => navigate(`/leads/${lead.id}`)}
                            title="Открыть"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => openSend(lead)}
                            title="Отправить оператору"
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                          >
                            <Send size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-sm text-gray-500">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}
            </p>
            <div className="flex gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="btn-secondary py-1.5 px-2.5 disabled:opacity-40"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary py-1.5 px-2.5 disabled:opacity-40"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Send to operator modal */}
      <Modal
        open={!!sendModal}
        onClose={() => { setSendModal(null); setSelectedOperatorId(''); }}
        title="Отправить клиента оператору"
        size="sm"
      >
        {sendModal && (
          <div className="space-y-4">
            {/* Client info */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Клиент:</span>
                <span className="font-medium text-gray-900">{sendModal.client?.name || sendModal.client?.phone}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Телефон:</span>
                <span className="font-mono text-gray-700">{sendModal.client?.phone}</span>
              </div>
              {sendModal.procedure && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Процедура:</span>
                  <span className="text-gray-700">{sendModal.procedure.name}</span>
                </div>
              )}
            </div>

            {/* Operator select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Выберите оператора
              </label>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {operators?.filter((op: any) => op.status === 'ACTIVE').map((op: any) => (
                  <label
                    key={op.id}
                    className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition ${
                      selectedOperatorId === op.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="operator"
                        value={op.id}
                        checked={selectedOperatorId === op.id}
                        onChange={() => setSelectedOperatorId(op.id)}
                        className="accent-blue-600"
                      />
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                        {op.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{op.name}</p>
                        <p className="text-xs text-gray-400">{op._count?.leads ?? 0} лидов</p>
                      </div>
                    </div>
                    <span className="badge bg-green-100 text-green-700">Активен</span>
                  </label>
                ))}
                {operators?.filter((op: any) => op.status === 'ACTIVE').length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">Нет активных операторов</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => assignMutation.mutate({ id: sendModal.id, operatorId: selectedOperatorId })}
                disabled={assignMutation.isPending || !selectedOperatorId}
                className="btn-primary flex-1 justify-center"
              >
                <Send size={14} />
                {assignMutation.isPending ? 'Отправка...' : 'Отправить'}
              </button>
              <button
                onClick={() => { setSendModal(null); setSelectedOperatorId(''); }}
                className="btn-secondary flex-1 justify-center"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
