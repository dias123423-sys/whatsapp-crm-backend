import { useQuery } from '@tanstack/react-query';
import { Users, CheckCircle, CalendarCheck, TrendingUp, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { leadsApi } from '../api/leads';
import { operatorsApi } from '../api/operators';
import { whatsappApi } from '../api/whatsapp';

function StatCard({ icon: Icon, label, value, color, sub }: {
  icon: any; label: string; value: string | number; color: string; sub?: string;
}) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={22} className="text-white" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: leadsApi.getDashboard,
    refetchInterval: 30_000,
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

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
          <p className="text-gray-500 text-sm mt-0.5">Статистика за сегодня</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary">
          <RefreshCw size={15} />
          Обновить
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsLoading
          ? [...Array(4)].map((_, i) => (
              <div key={i} className="card p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-16" />
              </div>
            ))
          : <>
              <StatCard icon={Users} label="Новые лиды" value={stats?.newLeads ?? 0} color="bg-blue-600" sub="Сегодня" />
              <StatCard icon={CheckCircle} label="Обработано" value={stats?.processed ?? 0} color="bg-orange-500" sub="Сегодня" />
              <StatCard icon={CalendarCheck} label="Записались" value={stats?.booked ?? 0} color="bg-green-600" sub="Сегодня" />
              <StatCard icon={TrendingUp} label="Конверсия" value={`${stats?.conversion ?? 0}%`} color="bg-purple-600" sub={`Всего: ${stats?.total ?? 0}`} />
            </>
        }
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WhatsApp status — 4 номера */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">WhatsApp номера</h2>
          {!whatsapps || whatsapps.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <WifiOff size={28} className="mx-auto mb-2" />
              <p className="text-sm">Нет подключённых номеров</p>
              <p className="text-xs mt-1">Перейдите в раздел WhatsApp для добавления</p>
            </div>
          ) : (
            <div className="space-y-3">
              {whatsapps.map((wa: any, idx: number) => (
                <div key={wa.id} className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${wa.status === 'ONLINE' ? 'bg-green-100' : 'bg-gray-200'}`}>
                      {wa.status === 'ONLINE'
                        ? <Wifi size={16} className="text-green-600" />
                        : <WifiOff size={16} className="text-gray-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        WhatsApp {idx + 1}
                      </p>
                      <p className="text-xs text-gray-400">{wa.instanceName}</p>
                    </div>
                  </div>
                  <span className={`badge ${
                    wa.status === 'ONLINE' ? 'bg-green-100 text-green-700' :
                    wa.status === 'CONNECTING' ? 'bg-yellow-100 text-yellow-700' :
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
              {operators.map((op: any) => (
                <div key={op.id} className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm">
                      {op.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{op.name}</p>
                      <p className="text-xs text-gray-400">
                        Получила: {op._count?.leads ?? 0} лидов
                      </p>
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

      {/* Night mode info */}
      <div className="card p-5 mt-5 bg-indigo-50 border-indigo-100">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🌙</div>
          <div>
            <p className="font-semibold text-indigo-900">Автоматический ночной отчёт</p>
            <p className="text-sm text-indigo-700 mt-0.5">
              Лиды с 19:00 до 08:00 помечаются как <strong>NIGHT</strong>. Каждый день в{' '}
              <strong>08:00</strong> система автоматически генерирует файл{' '}
              <strong>Night_Leads_Report.xlsx</strong> и сохраняет его в разделе Отчёты.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
