import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Phone, Stethoscope, BadgeDollarSign,
  Instagram, Calendar, MessageSquare, PhoneCall, CheckCircle2,
} from 'lucide-react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { leadsApi, callsApi } from '../api';

const STATUSES = [
  { value: 'NEW',       label: 'Новый',        color: 'border-blue-400 bg-blue-50 text-blue-700' },
  { value: 'CALLING',   label: 'Звонок',        color: 'border-yellow-400 bg-yellow-50 text-yellow-700' },
  { value: 'BOOKED',    label: 'Записан',       color: 'border-green-400 bg-green-50 text-green-700' },
  { value: 'FOLLOW_UP', label: 'Перезвонить',   color: 'border-purple-400 bg-purple-50 text-purple-700' },
  { value: 'NO_ANSWER', label: 'Не отвечает',   color: 'border-gray-300 bg-gray-50 text-gray-600' },
  { value: 'CLOSED',    label: 'Закрыт',        color: 'border-red-300 bg-red-50 text-red-600' },
];

export default function ClientCardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [comment, setComment]         = useState('');
  const [callResult, setCallResult]   = useState('');
  const [showCallLog, setShowCallLog] = useState(false);

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.getById(id!),
  });

  // sync comment when lead loads
  useEffect(() => {
    if (lead) setComment(lead.comment || '');
  }, [lead]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => leadsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['my-leads'] });
      toast.success('Сохранено');
    },
    onError: () => toast.error('Ошибка'),
  });

  const callMutation = useMutation({
    mutationFn: (data: any) => callsApi.log(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      setCallResult('');
      setShowCallLog(false);
      toast.success('Звонок записан');
    },
  });

  function handleStatusChange(status: string) {
    updateMutation.mutate({ status });
  }

  function handleSaveComment() {
    updateMutation.mutate({ comment });
  }

  function handleCall() {
    if (lead?.client?.phone) {
      window.location.href = `tel:${lead.client.phone}`;
    }
    updateMutation.mutate({ status: 'CALLING' });
    setShowCallLog(true);
  }

  function handleLogCall() {
    callMutation.mutate({ result: callResult });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-32" />
        <div className="card p-5 space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-5 bg-gray-100 rounded" />)}
        </div>
      </div>
    );
  }

  if (!lead) return null;

  const currentStatus = STATUSES.find((s) => s.value === lead.status);

  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        onClick={() => navigate('/leads')}
        className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition text-sm"
      >
        <ArrowLeft size={15} />
        Назад к списку
      </button>

      {/* Client info */}
      <div className="card p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
              {(lead.client?.name || lead.client?.phone || '?')[0].toUpperCase()}
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg">{lead.client?.name || 'Клиент'}</h1>
              <p className="text-gray-500 text-sm font-mono">{lead.client?.phone}</p>
            </div>
          </div>
          {currentStatus && (
            <span className={`badge border ${currentStatus.color}`}>{currentStatus.label}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Stethoscope,      label: 'Процедура', value: lead.procedure?.name || '—' },
            {
              icon: BadgeDollarSign,
              label: 'Цена',
              value: lead.price
                ? `${Number(lead.price).toLocaleString()} ₸`
                : lead.procedure?.price
                  ? `${Number(lead.procedure.price).toLocaleString()} ₸`
                  : '—',
            },
            { icon: Instagram, label: 'Источник', value: lead.source || '—' },
            { icon: Calendar,  label: 'Дата',     value: dayjs(lead.createdAt).format('DD.MM.YYYY HH:mm') },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={13} className="text-gray-400" />
                <p className="text-xs text-gray-500">{label}</p>
              </div>
              <p className="text-sm font-medium text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Call button */}
      <button
        onClick={handleCall}
        className="btn-green w-full justify-center py-3 text-base rounded-xl"
      >
        <PhoneCall size={18} />
        Позвонить {lead.client?.phone}
      </button>

      {/* Log call result */}
      {showCallLog && (
        <div className="card p-4 border-2 border-green-200">
          <p className="text-sm font-medium text-gray-700 mb-2">Результат звонка</p>
          <textarea
            className="input resize-none text-sm"
            rows={2}
            placeholder="Например: Клиент ответил, записался на 15 августа..."
            value={callResult}
            onChange={(e) => setCallResult(e.target.value)}
          />
          <button
            onClick={handleLogCall}
            disabled={callMutation.isPending}
            className="btn-primary w-full justify-center mt-2"
          >
            <CheckCircle2 size={15} />
            {callMutation.isPending ? 'Сохранение...' : 'Записать результат'}
          </button>
        </div>
      )}

      {/* Status */}
      <div className="card p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">Изменить статус</p>
        <div className="grid grid-cols-3 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => handleStatusChange(s.value)}
              disabled={updateMutation.isPending}
              className={`text-xs font-medium py-2 px-1 rounded-lg border-2 transition text-center ${
                lead.status === s.value
                  ? `${s.color} border-current`
                  : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Comment */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare size={15} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">Комментарий</p>
        </div>
        <textarea
          className="input resize-none text-sm"
          rows={3}
          placeholder="Заметки по клиенту..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <button
          onClick={handleSaveComment}
          disabled={updateMutation.isPending}
          className="btn-secondary w-full justify-center mt-2"
        >
          {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>

      {/* History */}
      <div className="card p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">История</p>
        {!lead.history?.length ? (
          <p className="text-xs text-gray-400 text-center py-3">Нет событий</p>
        ) : (
          <div className="space-y-2.5">
            {lead.history.map((h: any) => (
              <div key={h.id} className="flex gap-2.5">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-800">{h.event}</p>
                  {h.details && <p className="text-xs text-gray-500">{h.details}</p>}
                  <p className="text-xs text-gray-400">{dayjs(h.createdAt).format('DD.MM.YYYY HH:mm')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Calls */}
      {lead.calls?.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Звонки</p>
          <div className="space-y-2">
            {lead.calls.map((c: any) => (
              <div key={c.id} className="flex items-start gap-2.5 bg-gray-50 rounded-lg p-3">
                <PhoneCall size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">{dayjs(c.calledAt).format('DD.MM.YYYY HH:mm')}</p>
                  {c.result && <p className="text-xs text-gray-700 mt-0.5">{c.result}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
