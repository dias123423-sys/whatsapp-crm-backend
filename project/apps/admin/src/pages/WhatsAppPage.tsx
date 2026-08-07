import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Wifi, WifiOff, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { whatsappApi } from '../api/whatsapp';
import Modal from '../components/Modal';
import { useState } from 'react';

// Operator mapping per WhatsApp number
const WA_OPERATOR: Record<string, string> = {
  WA1: 'Эмиль',
  WA2: 'Улдай',
  WA3: 'Улдай',
  WA4: 'Улдай',
};

export default function WhatsAppPage() {
  const queryClient = useQueryClient();
  const [qrModal, setQrModal] = useState<{ name: string; qr: string } | null>(null);

  const { data: instances, isLoading, refetch } = useQuery({
    queryKey: ['whatsapp'],
    queryFn: whatsappApi.getAll,
    refetchInterval: 15_000,
  });

  async function fetchQr(name: string) {
    try {
      const data = await whatsappApi.getQr(name);
      const qrCode = data?.qrcode?.base64 || data?.base64 || data?.qr || data?.code;
      if (qrCode) {
        setQrModal({ name, qr: qrCode });
      } else {
        toast.error('QR недоступен — номер уже подключён или ещё не готов');
      }
    } catch {
      toast.error('Не удалось получить QR-код');
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
          <p className="text-gray-500 text-sm mt-0.5">4 подключённых номера</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary">
          <RefreshCw size={15} />
          Обновить
        </button>
      </div>

      {/* Status grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-32" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {instances?.map((inst: any, idx: number) => {
            const isOnline = inst.status === 'ONLINE';
            const operatorName = WA_OPERATOR[inst.instanceName] || '—';
            return (
              <div key={inst.id} className="card p-5">
                {/* Icon + Status */}
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isOnline ? 'bg-green-100' : 'bg-gray-100'}`}>
                    {isOnline
                      ? <Wifi size={20} className="text-green-600" />
                      : <WifiOff size={20} className="text-gray-400" />}
                  </div>
                  <span className={`badge ${
                    inst.status === 'ONLINE'      ? 'bg-green-100 text-green-700' :
                    inst.status === 'CONNECTING'  ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {inst.status === 'ONLINE' ? 'ONLINE' :
                     inst.status === 'CONNECTING' ? 'Подключение' : 'OFFLINE'}
                  </span>
                </div>

                {/* Instance info */}
                <div className="space-y-1.5">
                  <p className="font-semibold text-gray-900">
                    WhatsApp {idx + 1} — {inst.instanceName}
                  </p>

                  {/* Phone number — prominent */}
                  <div className="flex items-center gap-1.5">
                    <Phone size={13} className={isOnline ? 'text-green-500' : 'text-gray-400'} />
                    <span className={`text-sm font-mono font-medium ${isOnline ? 'text-gray-900' : 'text-gray-400'}`}>
                      {inst.phone || 'Не подключён'}
                    </span>
                  </div>

                  {/* Operator */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Оператор:</span>
                    <span className={`badge text-xs ${
                      operatorName === 'Эмиль' ? 'bg-blue-100 text-blue-700' :
                      operatorName === 'Улдай' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{operatorName}</span>
                  </div>
                </div>

                {/* QR button if offline */}
                {!isOnline && (
                  <button
                    onClick={() => fetchQr(inst.instanceName)}
                    className="mt-4 btn-primary w-full justify-center text-xs py-1.5"
                  >
                    Получить QR-код
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* All online banner */}
      {instances?.every((i: any) => i.status === 'ONLINE') && (
        <div className="card p-4 bg-green-50 border-green-100 flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <Wifi size={16} className="text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-green-800">Все 4 номера подключены</p>
            <p className="text-xs text-green-600">Входящие сообщения принимаются и создают лиды автоматически</p>
          </div>
        </div>
      )}

      {/* Mapping table */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Распределение номеров по операторам</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">WhatsApp</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Номер</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Статус</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Оператор</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Excel отчёт</th>
              </tr>
            </thead>
            <tbody>
              {instances?.map((inst: any, idx: number) => {
                const opName = WA_OPERATOR[inst.instanceName] || '—';
                return (
                  <tr key={inst.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">WhatsApp {idx + 1} ({inst.instanceName})</td>
                    <td className="px-4 py-3 font-mono text-gray-800">
                      {inst.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone size={12} className="text-gray-400" />
                          {inst.phone}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${inst.status === 'ONLINE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {inst.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${opName === 'Эмиль' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {opName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {opName === 'Эмиль' ? 'Emil_*.xlsx' : 'Uldai_*.xlsx'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-medium mb-1">Как подключить номер (если OFFLINE)</p>
          <ol className="space-y-1 text-xs text-blue-700">
            <li>1. Нажмите "Получить QR-код" на карточке</li>
            <li>2. Откройте WhatsApp → Настройки → Связанные устройства → Привязать</li>
            <li>3. Отсканируйте QR-код (действует 60 сек)</li>
            <li>4. Статус изменится на ONLINE</li>
          </ol>
        </div>
      </div>

      {/* QR Modal */}
      <Modal open={!!qrModal} onClose={() => setQrModal(null)} title={`QR — ${qrModal?.name}`} size="sm">
        {qrModal && (
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              WhatsApp → Настройки → Связанные устройства → Привязать
            </p>
            <div className="flex justify-center">
              <img
                src={qrModal.qr.startsWith('data:') ? qrModal.qr : `data:image/png;base64,${qrModal.qr}`}
                alt="QR Code"
                className="w-56 h-56 border-2 border-gray-200 rounded-xl"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-4">QR-код действителен 60 секунд</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
