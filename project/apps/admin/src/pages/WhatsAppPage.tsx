import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { whatsappApi } from '../api/whatsapp';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';

export default function WhatsAppPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [instanceName, setInstanceName] = useState('');
  const [qrModal, setQrModal] = useState<{ name: string; qr: string } | null>(null);

  const { data: instances, isLoading, refetch } = useQuery({
    queryKey: ['whatsapp'],
    queryFn: whatsappApi.getAll,
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => whatsappApi.create(name),
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      setShowAdd(false);
      setInstanceName('');
      toast.success('Экземпляр создан. Получаем QR-код...');
      // fetch QR
      try {
        const qrData = await whatsappApi.getQr(data.instance?.instanceName || instanceName);
        const qrCode = qrData?.qrcode?.base64 || qrData?.base64 || qrData?.qr;
        if (qrCode) {
          setQrModal({ name: data.instance?.instanceName || instanceName, qr: qrCode });
        }
      } catch {
        toast('QR-код ещё не готов. Обновите страницу через 5 секунд.', { icon: 'ℹ️' });
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Ошибка'),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => whatsappApi.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      toast.success('Удалено');
    },
  });

  async function fetchQr(name: string) {
    try {
      const data = await whatsappApi.getQr(name);
      const qrCode = data?.qrcode?.base64 || data?.base64 || data?.qr;
      if (qrCode) setQrModal({ name, qr: qrCode });
      else toast.error('QR-код недоступен. Экземпляр уже подключён?');
    } catch {
      toast.error('Не удалось получить QR-код');
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
          <p className="text-gray-500 text-sm mt-0.5">Управление подключениями</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary">
            <RefreshCw size={15} />
            Обновить
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus size={16} />
            Добавить номер
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-32 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-20" />
            </div>
          ))}
        </div>
      ) : instances?.length === 0 ? (
        <div className="card p-12 text-center">
          <WifiOff size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Нет подключённых номеров</p>
          <p className="text-gray-400 text-sm mt-1">Добавьте WhatsApp номер для получения лидов</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {instances?.map((inst: any) => (
            <div key={inst.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    inst.status === 'ONLINE' ? 'bg-green-100' : 'bg-gray-100'
                  }`}
                >
                  {inst.status === 'ONLINE' ? (
                    <Wifi size={20} className="text-green-600" />
                  ) : (
                    <WifiOff size={20} className="text-gray-400" />
                  )}
                </div>
                <StatusBadge status={inst.status} />
              </div>

              <p className="font-semibold text-gray-900 text-sm">{inst.instanceName}</p>
              {inst.phone && <p className="text-xs text-gray-500 mt-0.5">{inst.phone}</p>}

              <div className="flex gap-2 mt-4">
                {inst.status !== 'ONLINE' && (
                  <button
                    onClick={() => fetchQr(inst.instanceName)}
                    className="flex-1 btn-primary text-xs py-1.5 justify-center"
                  >
                    QR-код
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm(`Удалить ${inst.instanceName}?`)) {
                      deleteMutation.mutate(inst.instanceName);
                    }
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="card p-6 mt-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Как подключить номер</h2>
        <ol className="space-y-2 text-sm text-gray-600">
          {[
            'Нажмите "Добавить номер" и введите название (например: whatsapp-1)',
            'Нажмите "QR-код" на карточке созданного экземпляра',
            'Отсканируйте QR-код из WhatsApp → Связанные устройства',
            'Статус изменится на ONLINE — номер готов принимать сообщения',
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Добавить WhatsApp" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Название экземпляра
            </label>
            <input
              type="text"
              className="input"
              placeholder="whatsapp-1"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value.replace(/\s/g, '-').toLowerCase())}
            />
            <p className="text-xs text-gray-400 mt-1">Только латиница, цифры и дефисы</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => createMutation.mutate(instanceName)}
              disabled={createMutation.isPending || !instanceName}
              className="btn-primary flex-1 justify-center"
            >
              {createMutation.isPending ? 'Создание...' : 'Создать'}
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1 justify-center">
              Отмена
            </button>
          </div>
        </div>
      </Modal>

      {/* QR Modal */}
      <Modal open={!!qrModal} onClose={() => setQrModal(null)} title={`QR — ${qrModal?.name}`} size="sm">
        {qrModal && (
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              Откройте WhatsApp → Связанные устройства → Привязать устройство
            </p>
            <div className="flex justify-center">
              <img
                src={qrModal.qr.startsWith('data:') ? qrModal.qr : `data:image/png;base64,${qrModal.qr}`}
                alt="QR Code"
                className="w-56 h-56 border-2 border-gray-200 rounded-xl"
              />
            </div>
            <p className="text-xs text-gray-400 mt-4">QR-код действителен 60 секунд</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
