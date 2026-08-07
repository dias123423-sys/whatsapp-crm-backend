import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Download, RefreshCw, Moon, Sun } from 'lucide-react';
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
  if (!res.ok) return [];
  return res.json();
}

function downloadFile(filename: string) {
  const url = `${API_URL}/reports/download?file=${encodeURIComponent(filename)}`;
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

function ReportTypeLabel({ filename }: { filename: string }) {
  const isNight = filename.startsWith('Night');
  return (
    <span className={`badge ${isNight ? 'bg-indigo-100 text-indigo-700' : 'bg-yellow-100 text-yellow-700'}`}>
      {isNight ? '🌙 Ночной' : '☀️ Дневной'}
    </span>
  );
}

// ── Generate card ─────────────────────────────────────────────────────────────
function GenerateCard({
  type,
  icon: Icon,
  iconBg,
  title,
  period,
  autoTime,
  onGenerate,
  isLoading,
  generatedFiles,
}: {
  type: 'night' | 'daily';
  icon: any;
  iconBg: string;
  title: string;
  period: string;
  autoTime: string;
  onGenerate: () => void;
  isLoading: boolean;
  generatedFiles: string[];
}) {
  return (
    <div className="card p-6">
      <div className="flex items-start gap-4 mb-5">
        <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon size={22} className="text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 text-base">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{period}</p>
          <p className="text-xs text-gray-400">Авто-генерация в <strong>{autoTime}</strong></p>
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={isLoading}
        className="btn-primary w-full justify-center"
      >
        {isLoading
          ? <><RefreshCw size={14} className="animate-spin" /> Генерация...</>
          : <><FileSpreadsheet size={14} /> Сгенерировать сейчас</>}
      </button>

      {/* Files generated in this session */}
      {generatedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {generatedFiles.map((f) => (
            <div key={f} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-600 truncate flex-1">{f}</span>
              <button
                onClick={() => downloadFile(f)}
                className="ml-3 flex-shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <Download size={13} />
                Скачать
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const queryClient = useQueryClient();
  const [nightFiles, setNightFiles] = useState<string[]>([]);
  const [dailyFiles, setDailyFiles] = useState<string[]>([]);

  const { data: reports, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: getReportsList,
  });

  const nightMutation = useMutation({
    mutationFn: () => generateReport('night'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      const files = data.files || [];
      setNightFiles(files);
      toast.success('Ночной отчёт готов');
    },
    onError: () => toast.error('Ошибка генерации'),
  });

  const dailyMutation = useMutation({
    mutationFn: () => generateReport('daily'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      const files = data.files || [];
      setDailyFiles(files);
      toast.success('Дневной отчёт готов');
    },
    onError: () => toast.error('Ошибка генерации'),
  });

  const reportsList: any[] = Array.isArray(reports) ? [...reports].reverse() : [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Отчёты Excel</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Ночной отчёт формируется в 09:00 · Дневной — в 20:00
        </p>
      </div>

      {/* Generate cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        <GenerateCard
          type="night"
          icon={Moon}
          iconBg="bg-indigo-600"
          title="Ночной отчёт"
          period="Период: 19:00 – 09:00"
          autoTime="09:00"
          onGenerate={() => nightMutation.mutate()}
          isLoading={nightMutation.isPending}
          generatedFiles={nightFiles}
        />
        <GenerateCard
          type="daily"
          icon={Sun}
          iconBg="bg-yellow-500"
          title="Дневной отчёт"
          period="Период: 00:00 – 19:59"
          autoTime="20:00"
          onGenerate={() => dailyMutation.mutate()}
          isLoading={dailyMutation.isPending}
          generatedFiles={dailyFiles}
        />
      </div>

      {/* History table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">История отчётов</h2>
          <span className="text-xs text-gray-400">{reportsList.length} файлов</span>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : reportsList.length === 0 ? (
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Дата</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Лидов</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Файл</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {reportsList.map((r: any) => {
                  const filename = r.filePath ? r.filePath.split('/').pop() : '';
                  return (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <ReportTypeLabel filename={filename || r.type || ''} />
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {dayjs(r.date || r.createdAt).format('DD.MM.YYYY HH:mm')}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono">
                        {r.data?.count ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono truncate max-w-xs">
                        {filename || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {filename && (
                          <button
                            onClick={() => downloadFile(filename)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
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

      {/* Excel format info */}
      <div className="card p-5 mt-5">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">Колонки в Excel файле</h3>
        <div className="flex flex-wrap gap-2">
          {['#', 'Дата', 'Время', 'Телефон', 'Имя', 'Процедура', 'Цена (₸)', 'Оператор', 'Статус'].map((col) => (
            <span key={col} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-lg font-medium">
              {col}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Строки без процедуры выделены{' '}
          <span className="bg-yellow-100 text-yellow-800 px-1 rounded">жёлтым</span>
        </p>
      </div>
    </div>
  );
}
