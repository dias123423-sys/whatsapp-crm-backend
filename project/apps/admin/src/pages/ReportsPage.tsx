import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Download, RefreshCw, Moon, Sun } from 'lucide-react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { reportsApi } from '../api/users';

export default function ReportsPage() {
  const queryClient = useQueryClient();

  const { data: reports, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: reportsApi.getList,
  });

  const nightMutation = useMutation({
    mutationFn: reportsApi.generateNight,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reports'] }); toast.success('Ночной отчёт сгенерирован'); },
    onError: () => toast.error('Ошибка генерации'),
  });

  const dailyMutation = useMutation({
    mutationFn: reportsApi.generateDaily,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reports'] }); toast.success('Дневной отчёт сгенерирован'); },
    onError: () => toast.error('Ошибка генерации'),
  });

  const typeLabel: Record<string, string> = { NIGHT: 'Ночной', DAILY: 'Дневной', WEEKLY: 'Недельный' };
  const typeColor: Record<string, string> = {
    NIGHT: 'bg-indigo-100 text-indigo-700',
    DAILY: 'bg-yellow-100 text-yellow-700',
    WEEKLY: 'bg-green-100 text-green-700',
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Отчёты</h1>
          <p className="text-gray-500 text-sm mt-0.5">Excel отчёты по лидам</p>
        </div>
      </div>

      {/* Generate cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Moon size={20} className="text-indigo-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Ночной отчёт</h3>
              <p className="text-sm text-gray-500 mt-0.5">Лиды поступившие с 19:00 до 08:00</p>
              <p className="text-xs text-gray-400 mt-1">Автоматически генерируется каждый день в 08:00</p>
            </div>
          </div>
          <button
            onClick={() => nightMutation.mutate()}
            disabled={nightMutation.isPending}
            className="btn-primary mt-4 w-full justify-center"
          >
            {nightMutation.isPending ? (
              <><RefreshCw size={14} className="animate-spin" /> Генерация...</>
            ) : (
              <><FileSpreadsheet size={14} /> Сгенерировать сейчас</>
            )}
          </button>
        </div>

        <div className="card p-5">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 bg-yellow-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Sun size={20} className="text-yellow-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Дневной отчёт</h3>
              <p className="text-sm text-gray-500 mt-0.5">Все лиды за сегодня</p>
              <p className="text-xs text-gray-400 mt-1">Автоматически генерируется каждый день в 20:00</p>
            </div>
          </div>
          <button
            onClick={() => dailyMutation.mutate()}
            disabled={dailyMutation.isPending}
            className="btn-primary mt-4 w-full justify-center"
          >
            {dailyMutation.isPending ? (
              <><RefreshCw size={14} className="animate-spin" /> Генерация...</>
            ) : (
              <><FileSpreadsheet size={14} /> Сгенерировать сейчас</>
            )}
          </button>
        </div>
      </div>

      {/* Reports table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">История отчётов</h2>
        </div>
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : reports?.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Нет отчётов</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 font-medium text-gray-600">Тип</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Дата</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Лидов</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Файл</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {reports?.map((r: any) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="px-5 py-3">
                    <span className={`badge ${typeColor[r.type] || 'bg-gray-100 text-gray-600'}`}>
                      {typeLabel[r.type] || r.type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {dayjs(r.date).format('DD.MM.YYYY')}
                  </td>
                  <td className="px-5 py-3 text-gray-700">{r.data?.count ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs font-mono">
                    {r.filePath ? r.filePath.split('/').pop() : '—'}
                  </td>
                  <td className="px-5 py-3">
                    {r.filePath && (
                      <a
                        href={reportsApi.downloadUrl(r.filePath.split('/').pop())}
                        download
                        className="btn-secondary py-1 px-2.5 text-xs"
                      >
                        <Download size={13} />
                        Скачать
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Excel columns info */}
      <div className="card p-5 mt-5">
        <h3 className="font-semibold text-gray-900 mb-3">Колонки в Excel отчёте</h3>
        <div className="flex flex-wrap gap-2">
          {['Дата', 'Время', 'Телефон', 'Имя', 'Процедура', 'Цена (₸)', 'Источник', 'Оператор', 'Статус', 'Результат'].map((col) => (
            <span key={col} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-lg font-medium">
              {col}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
