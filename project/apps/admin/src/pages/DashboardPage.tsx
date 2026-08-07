import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  CalendarCheck,
  TrendingUp,
  Clock,
  Wifi,
  WifiOff,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { leadsApi } from '../api/leads';
import { operatorsApi } from '../api/operators';
import { whatsappApi } from '../api/whatsapp';
import { useSse } from '../hooks/useSse';
import dayjs from 'dayjs';

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  highlight,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`card p-5 ${highlight ? 'ring-2 ring-blue-400' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: leadsApi.getDashboard,
    // Fallback polling every 60s in case SSE connection drops
    refetchInterval: 60_000,
  });

  const { data: operators } = useQuery({
    queryKey: ['operators'],
    queryFn: operatorsApi.getAll,
  });

  const { data: whatsapps } = useQuery({
    queryKey: ['whatsapp'],
    queryFn: whatsappApi.getAll,
    refetchInterval: 15_000,
  });

  // Real-time: invalidate dashboard stats whenever a new lead arrives via SSE
  useSse({
    onNewLead: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onLeadUpdated: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const s = stats as any;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {dayjs().format('DD MMMM YYYY')} — обновляется автоматически
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {statsLoading
          ? [...Array(5)].map((_, i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-20 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-14" />
              </div>
            ))
          : <>
              <StatCard
                icon={Users}
                label="Всего лидов"
                value={s?.total ?? 0}
                sub="За всё время"
                color="bg-gray-700"
              />
              <StatCard
                icon={CalendarCheck}
                label="Сегодня"
                value={s?.today ?? 0}
                sub={dayjs().format('DD.MM.YYYY')}
                color="bg-blue-600"
                highlight
              />
              <StatCard
                icon={Clock}
                label="Вчера"
                value={s?.yesterday ?? 0}
                sub={dayjs().subtract(1, 'day').format('DD.MM.YYYY')}
                color="bg-indigo-500"
              />
              <StatCard
                icon={AlertCircle}
                label="Новые"
                value={s?.newLeads ?? 0}
                sub="Статус NEW сегодня"
                color="bg-orange-500"
              />
              <StatCard
                icon={CheckCircle2}
                label="Необработанные"
                value={s?.unprocessed ?? 0}
                sub="Всего со статусом NEW"
                color="bg-red-500"
              />
            </>
        }
      </div>

      {/* Conversion strip */}
      {!statsLoading && (
        <div className="card p-4 mb-6 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">Конверсия (записались сегодня)</span>
              <span className="text-sm font-bold text-gray-900">{s?.conversion ?? 0}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(s?.conversion ?? 0, 100)}%` }}
              />
            </div>
          </div>
          <div className="text-right text-sm text-gray-500 whitespace-nowrap">
            Записались: <span className="font-semibold text-green-700">{s?.booked ?? 0}</span>
            {' / '}
            Сегодня: <span className="font-semibold">{s?.today ?? 0}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WhatsApp accounts */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">WhatsApp номера</h2>
          {!whatsapps || whatsapps.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <WifiOff size={28} className="mx-auto mb-2" />
              <p className="text-sm">Нет подключённых номеров</p>
            </div>
          ) : (
            <div className="space-y-2">
              {whatsapps.map((wa: any, idx: number) => (
                <div key={wa.id} className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${wa.status === 'ONLINE' ? 'bg-green-100' : 'bg-gray-200'}`}>
                      {wa.status === 'ONLINE'
                        ? <Wifi size={16} className="text-green-600" />
                        : <WifiOff size={16} className="text-gray-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">WhatsApp {idx + 1}</p>
                      <p className="text-xs text-gray-400">{wa.phone || wa.instanceName}</p>
                    </div>
                  </div>
                  <span className={`badge ${
                    wa.status === 'ONLINE'      ? 'bg-green-100 text-green-700' :
                    wa.status === 'CONNECTING'  ? 'bg-yellow-100 text-yellow-700' :
                                                  'bg-gray-100 text-gray-500'
                  }`}>
                    {wa.status === 'ONLINE' ? 'ONLINE' : wa.status === 'CONNECTING' ? 'Подключение' : 'OFFLINE'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Operators */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Операторы</h2>
          {!operators || operators.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Нет операторов</p>
          ) : (
            <div className="space-y-2">
              {(operators as any[]).map((op: any) => (
                <div key={op.id} className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm">
                      {op.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{op.name}</p>
                      <p className="text-xs text-gray-400">{op._count?.leads ?? 0} лидов</p>
                    </div>
                  </div>
                  <span className={`badge ${op.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {op.status === 'ACTIVE' ? 'Активен' : 'Неактивен'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Report schedule info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="card p-4 bg-indigo-50 border-indigo-100">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🌙</span>
            <div>
              <p className="font-semibold text-indigo-900 text-sm">Ночной отчёт</p>
              <p className="text-xs text-indigo-700 mt-0.5">Период: 19:00 – 09:00 · Генерируется автоматически в <strong>09:00</strong></p>
            </div>
          </div>
        </div>
        <div className="card p-4 bg-yellow-50 border-yellow-100">
          <div className="flex items-start gap-3">
            <span className="text-2xl">☀️</span>
            <div>
              <p className="font-semibold text-yellow-900 text-sm">Дневной отчёт</p>
              <p className="text-xs text-yellow-700 mt-0.5">Период: 00:00 – 19:59 · Генерируется автоматически в <strong>20:00</strong></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
