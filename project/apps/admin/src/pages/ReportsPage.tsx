import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Download, RefreshCw, Moon, Sun, User } from 'lucide-react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

async function generateReport(type: 'night' | 'daily'): Promise<{ files: string[] }> {
  const res = await fetch(`${API_URL}/reports/generate/${type}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

async function getReportsList() {
  const res = await fetch(`${API_URL}/reports`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  return res.json();
}

function downloadFile(filename: string) {
  const url = `${API_URL}/reports/download?file=${encodeURIComponent(filename)}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.setAttribute('target', '_blank');
  // Add auth header via hidden form trick won't work — use fetch blob instead
  fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
    .then((r) => {
      if (!r.ok) throw new Error('Download failed');
      return r.blob();
    })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    })
    .catch(() => toast.error('Ошибка скачивания'));
}

// Determine operator label from filename
function getOperatorLabel(filename: string): { label: string; color: string } {
  if (filename.includes('Emil'))  return { label: 'Эмиль',          color: 'bg-blue-100 text-blue-700' };
  if (filename.includes('Uldai')) return { label: 'Улдай',          color: 'bg-purple-100 text-purple-700' };
  if (filename.includes('All'))   return { label: 'Все операторы',  color: 'bg-gray-100 text-gray-700' };
  return { label: '—', color: 'bg-gray-100 text-gray-600' };
}

function getTypeLabel(filename: string): { label: string; color: string } {
  if (filename.startsWith('Night')) return { label: 'Ночной',  color: 'bg-indigo-100 text-indigo-700' };
  if (filename.startsWith('Daily')) return { label: 'Дневной', color: 'bg-yellow-100 text-yellow-700' };
  return { label: 'Отчёт', color: 'bg-gray-100 text-gray-600' };
}

interface GeneratedFiles {
  night: string[];
  daily: string[];
}

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFiles>({ night: [], daily: [] });

  const { data: reports, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: getReportsList,
  });

  const nightMutation = useMutation({
    mutationFn: () => generateReport('night'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setGeneratedFiles((prev) => ({ ...prev, night: data.files || [] }));
      toast.success(`Ночной отчёт готов: ${data.files?.length || 0} файлов`);
    },
    onError: () => toast.error('Ошибка генерации'),
  });

  const dailyMutation = useMutation({
    mutationFn: () => generateReport('daily'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setGeneratedFiles((prev) => ({ ...prev, daily: data.files || [] }));
      toast.success(`Дневной отчёт готов: ${data.files?.length || 0} файлов`);
    },
    onError: () => toast.error('Ошибка генерации'),
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Отчёты Excel</h1>
          <p className="text-gray-500 text-sm mt-0.5">Отдельные файлы для Эмиля и Улдай</p>
        </div>
      </div>

      {/* Generate buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        {/* Night Report */}
        <div className="card p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Moon size={20} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Ночной отчёт</h3>
              <p className="text-xs text-gray-500 mt-0.5">19:00 – 09:00 | Авто в 09:00</p>
            </div>
          </div>

          <button
            onClick={() => nightMutation.mutate()}
            disabled={nightMutation.isPending}
            className="btn-primary w-full justify-center mb-3"
          >
            {nightMutation.isPending
              ? <><RefreshCw size={14} className="animate-spin" /> Генерация...</>
              : <><FileSpreadsheet size={14} /> Сгенерировать</>}
          </button>

          {/* Night files */}
          {generatedFiles.night.length > 0 && (
            <div className="space-y-2">
              {generatedFiles.night.map((f) => {
                const op = getOperatorLabel(f);
                return (
                  <div key={f} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <User size={13} className="text-gray-400 flex-shrink-0" />
                      <span className={`badge text-xs ${op.color}`}>{op.label}</span>
                      <span className="text-xs text-gray-600 truncate">{f}</span>
                    </div>
                    <button
                      onClick={() => downloadFile(f)}
                      className="ml-2 flex-shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Download size={13} />
                      Скачать
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Daily Report */}
        <div className="card p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-11 h-11 bg-yellow-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Sun size={20} className="text-yellow-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Дневной отчёт</h3>
              <p className="text-xs text-gray-500 mt-0.5">Все лиды за сегодня | Авто в 20:00</p>
            </div>
          </div>

          <button
            onClick={() => dailyMutation.mutate()}
            disabled={dailyMutation.isPending}
            className="btn-primary w-full justify-center mb-3"
          >
            {dailyMutation.isPending
              ? <><RefreshCw size={14} className="animate-spin" /> Генерация...</>
              : <><FileSpreadsheet size={14} /> Сгенерировать</>}
          </button>

          {/* Daily files */}
          {generatedFiles.daily.length > 0 && (
            <div className="space-y-2">
              {generatedFiles.daily.map((f) => {
                const op = getOperatorLabel(f);
                return (
                  <div key={f} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <User size={13} className="text-gray-400 flex-shrink-0" />
                      <span className={`badge text-xs ${op.color}`}>{op.label}</span>
                      <span className="text-xs text-gray-600 truncate">{f}</span>
                    </div>
                    <button
                      onClick={() => downloadFile(f)}
                      className="ml-2 flex-shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Download size={13} />
                      Скачать
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Operator legend */}
      <div className="card p-4 mb-5 bg-blue-50 border-blue-100">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Распределение по операторам</h3>
        <div className="flex flex-wrap gap-4 text-sm text-blue-800">
          <div className="flex items-center gap-2">
            <span className="badge bg-blue-200 text-blue-800">Эмиль</span>
            <span>← WA1 (+77085995047)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge bg-purple-200 text-purple-800">Улдай</span>
            <span>← WA2 (+77083274500) · WA3 (+77058716017) · WA4 (+77085991789)</span>
          </div>
        </div>
      </div>

      {/* Reports history table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">История отчётов</h2>
          <span className="text-xs text-gray-400">{reports?.length || 0} файлов</span>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !reports?.length ? (
          <div className="p-12 text-center text-gray-400">
            <FileSpreadsheet size={32} className="mx-auto mb-2 opacity-30" />
            <p>Нет отчётов. Сгенерируйте первый.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Тип</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Оператор</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Дата</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Лидов</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Файл</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {[...reports].reverse().map((r: any) => {
                  const filename = r.filePath ? r.filePath.split('/').pop() : '';
                  const typeInfo = getTypeLabel(filename);
                  const opInfo = getOperatorLabel(filename);
                  return (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <span className={`badge ${typeInfo.color}`}>{typeInfo.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${opInfo.color}`}>{opInfo.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {dayjs(r.date || r.createdAt).format('DD.MM.YYYY')}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {r.data?.count ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono truncate max-w-xs">
                        {filename || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {filename && (
                          <button
                            onClick={() => downloadFile(filename)}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            <Download size={13} />
                            Скачать
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Excel columns info */}
      <div className="card p-5 mt-5">
        <h3 className="font-semibold text-gray-900 mb-3">Колонки в Excel файле</h3>
        <div className="flex flex-wrap gap-2">
          {['#', 'Дата', 'Время', 'Телефон', 'Имя', 'Процедура', 'Цена (₸)', 'Источник', 'Оператор', 'Статус'].map((col) => (
            <span key={col} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-lg font-medium">
              {col}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Строки без процедуры выделены <span className="bg-yellow-100 text-yellow-800 px-1 rounded">жёлтым</span>
        </p>
      </div>
    </div>
  );
}
