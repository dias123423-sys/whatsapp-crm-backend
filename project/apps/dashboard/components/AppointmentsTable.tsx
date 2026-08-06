'use client';

import { Appointment, AppointmentFilters, CreatedBy, WhatsAppAccount } from '@/types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Trash2, Bot, User, Download, FileSpreadsheet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';

interface Props {
  appointments: Appointment[];
  total: number;
  page: number;
  totalPages: number;
  loading?: boolean;
  filters: AppointmentFilters;
  onFiltersChange: (filters: Partial<AppointmentFilters>) => void;
}

type TabKey = '' | 'BOT' | 'OPERATOR';

export function AppointmentsTable({
  appointments,
  total,
  page,
  totalPages,
  loading,
  filters,
  onFiltersChange,
}: Props) {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const activeTab = (filters.createdBy || '') as TabKey;

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить эту запись?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/appointments/${id}`);
      toast.success('Запись удалена');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch {
      toast.error('Ошибка при удалении');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = async (type: 'AINUR' | 'AIBEK' | 'BOT' | 'ALL') => {
    setExporting(type);
    try {
      const response = await api.get(`/api/appointments/export?type=${type}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type.toLowerCase()}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      const labels: Record<string, string> = {
        AINUR: 'Айнур (WA1)',
        AIBEK: 'Айбек (WA2-4)',
        BOT:   'BOT (все)',
        ALL:   'Все',
      };
      toast.success(`Excel (${labels[type]}) скачан`);
    } catch {
      toast.error('Ошибка при экспорте');
    } finally {
      setExporting(null);
    }
  };

  const tabs: { key: TabKey; label: string; icon?: ReactNode }[] = [
    { key: '', label: 'Все' },
    { key: 'BOT', label: 'BOT', icon: <Bot size={14} /> },
    { key: 'OPERATOR', label: 'OPERATOR', icon: <User size={14} /> },
  ];

  return (
    <div className="card">
      {/* Tabs: Все / BOT / OPERATOR */}
      <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-gray-100 pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key || 'all'}
            onClick={() =>
              onFiltersChange({
                createdBy: (tab.key || undefined) as CreatedBy | '' | undefined,
                page: 1,
              })
            }
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab.key
                ? tab.key === 'BOT'
                  ? 'bg-emerald-100 text-emerald-700'
                  : tab.key === 'OPERATOR'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-900 text-white'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Excel downloads by owner */}
        <button
          onClick={() => handleExport('AINUR')}
          disabled={!!exporting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          title="Айнур — WA1"
        >
          <Download size={14} />
          {exporting === 'AINUR' ? '...' : 'Айнур (WA1)'}
        </button>
        <button
          onClick={() => handleExport('AIBEK')}
          disabled={!!exporting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
          title="Айбек — WA2, WA3, WA4"
        >
          <Download size={14} />
          {exporting === 'AIBEK' ? '...' : 'Айбек (WA2-4)'}
        </button>
        <button
          onClick={() => handleExport('BOT')}
          disabled={!!exporting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          title="Тек BOT жазбалары — барлық аккаунт"
        >
          <Bot size={14} />
          {exporting === 'BOT' ? '...' : 'BOT (все)'}
        </button>
        <button
          onClick={() => handleExport('ALL')}
          disabled={!!exporting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          title="Все записи"
        >
          <FileSpreadsheet size={14} />
          {exporting === 'ALL' ? '...' : 'Все'}
        </button>
      </div>

      {/* Toolbar filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          placeholder="Поиск по имени или телефону..."
          className="input flex-1"
          value={filters.search || ''}
          onChange={(e) => onFiltersChange({ search: e.target.value, page: 1 })}
        />

        <input
          type="date"
          className="input w-auto"
          value={filters.startDate || ''}
          onChange={(e) => onFiltersChange({ startDate: e.target.value, page: 1 })}
        />
        <input
          type="date"
          className="input w-auto"
          value={filters.endDate || ''}
          onChange={(e) => onFiltersChange({ endDate: e.target.value, page: 1 })}
        />

        <select
          className="input w-auto"
          value={filters.whatsappAccount || ''}
          onChange={(e) => onFiltersChange({ whatsappAccount: e.target.value as WhatsAppAccount | '', page: 1 })}
        >
          <option value="">Все аккаунты</option>
          {['WA1', 'WA2', 'WA3', 'WA4'].map((wa) => (
            <option key={wa} value={wa}>
              {wa}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['#', 'Клиент', 'Телефон', 'Дата', 'Время', 'WhatsApp', 'Принял', 'Создано', ''].map(
                (h) => (
                  <th
                    key={h || 'actions'}
                    className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="py-3 px-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : appointments.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-3xl">📭</span>
                    <span>
                      {activeTab === 'BOT'
                        ? 'BOT записей нет'
                        : activeTab === 'OPERATOR'
                          ? 'OPERATOR записей нет'
                          : 'Записи не найдены'}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              appointments.map((apt, index) => (
                <tr
                  key={apt.id}
                  className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                >
                  <td className="py-3 px-3 text-gray-400 text-xs">
                    {(page - 1) * (filters.limit || 50) + index + 1}
                  </td>
                  <td className="py-3 px-3 font-medium">{apt.clientName}</td>
                  <td className="py-3 px-3 text-gray-600 font-mono text-xs">{apt.phone}</td>
                  <td className="py-3 px-3 text-gray-600">
                    {format(new Date(apt.appointmentDate), 'dd.MM.yyyy', { locale: ru })}
                  </td>
                  <td className="py-3 px-3 font-medium text-blue-700">{apt.appointmentTime}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                      {apt.whatsappAccount}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {apt.createdBy === 'BOT' ? (
                      <span className="badge-bot">
                        <Bot size={10} /> BOT
                      </span>
                    ) : (
                      <span className="badge-operator">
                        <User size={10} /> OPERATOR
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-gray-400 text-xs">
                    {format(new Date(apt.createdAt), 'dd.MM HH:mm')}
                  </td>
                  <td className="py-3 px-3">
                    <button
                      onClick={() => handleDelete(apt.id)}
                      disabled={deletingId === apt.id}
                      className={clsx(
                        'p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors',
                        deletingId === apt.id && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            Показано {appointments.length} из {total}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onFiltersChange({ page: page - 1 })}
              className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40"
            >
              ← Назад
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-600">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => onFiltersChange({ page: page + 1 })}
              className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40"
            >
              Вперёд →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
