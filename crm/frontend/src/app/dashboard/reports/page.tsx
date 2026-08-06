'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Download, BarChart2 } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import toast from 'react-hot-toast';

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo,   setDateTo]   = useState(format(new Date(), 'yyyy-MM-dd'));
  const [exporting, setExporting] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['report-stats', dateFrom, dateTo],
    queryFn: async () => {
      const r = await api.get(`/api/reports/stats?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      return r.data.data;
    },
  });

  async function handleExport() {
    setExporting(true);
    try {
      const r = await api.get(`/api/reports/export?dateFrom=${dateFrom}&dateTo=${dateTo}`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${dateFrom}_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel скачан');
    } catch { toast.error('Ошибка при экспорте'); }
    finally { setExporting(false); }
  }

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Отчёты</h1>

      <div className="card flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">От</label>
          <input type="date" className="input w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">До</label>
          <input type="date" className="input w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn-primary">
          <Download size={14} />
          {exporting ? 'Экспорт...' : 'Скачать Excel'}
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Всего лидов',  value: stats.stats.total,      color: 'text-blue-600' },
            { label: 'Записаны',     value: stats.stats.booked,     color: 'text-green-600' },
            { label: 'Нет ответа',   value: stats.stats.noAnswer,   color: 'text-red-600' },
            { label: 'Конверсия',    value: `${stats.stats.conversion}%`, color: 'text-purple-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
