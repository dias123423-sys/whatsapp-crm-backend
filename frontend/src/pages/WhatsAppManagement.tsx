import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth, useWhatsApp, useNotifications } from '@/lib/store';
import { whatsappApi } from '@/api/whatsapp.api';
import { socketClient } from '@/lib/socket';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Smartphone, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  QrCode,
  Phone,
  Calendar,
  AlertCircle
} from 'lucide-react';
import type { WhatsAppAccount } from '@/types';
import { whatsappStatusColors, whatsappStatusLabels } from '@/types';

export default function WhatsAppManagement() {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const { accounts, setAccounts, updateAccount } = useWhatsApp();
  const addNotification = useNotifications((state) => state.addNotification);
  
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<WhatsAppAccount | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string>('');
  const [qrLoading, setQrLoading] = useState(false);

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      navigate('/');
      return;
    }
    loadAccounts();

    // Setup WebSocket listeners
    const unsubscribeConnected = socketClient.on('whatsapp.connected', (data: WhatsAppAccount) => {
      updateAccount(data.id, data);
      addNotification({
        type: 'success',
        title: 'WhatsApp подключен',
        message: `${data.name} успешно подключен`,
      });
      setQrModalOpen(false);
    });

    const unsubscribeDisconnected = socketClient.on('whatsapp.disconnected', (data: WhatsAppAccount) => {
      updateAccount(data.id, data);
      addNotification({
        type: 'warning',
        title: 'WhatsApp отключен',
        message: `${data.name} отключен`,
      });
    });

    const unsubscribeQR = socketClient.on('whatsapp.qr_updated', (data: { accountId: string; qrCode: string }) => {
      setQrCode(data.qrCode);
    });

    const unsubscribeError = socketClient.on('whatsapp.error', (data: { accountId: string; error: string }) => {
      addNotification({
        type: 'error',
        title: 'Ошибка WhatsApp',
        message: data.error,
      });
    });

    return () => {
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeQR();
      unsubscribeError();
    };
  }, [user, navigate]);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const response = await whatsappApi.getAll();
      setAccounts(response.data);
    } catch (error) {
      console.error('Failed to load WhatsApp accounts:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка загрузки',
        message: 'Не удалось загрузить WhatsApp аккаунты',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQR = async (account: WhatsAppAccount) => {
    try {
      setQrLoading(true);
      setSelectedAccount(account);
      setQrModalOpen(true);
      
      const response = await whatsappApi.generateQR(account.id);
      setQrCode(response.data.qrCode);
    } catch (error: any) {
      console.error('Failed to generate QR:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка генерации QR',
        message: error.response?.data?.message || 'Не удалось сгенерировать QR код',
      });
      setQrModalOpen(false);
    } finally {
      setQrLoading(false);
    }
  };

  const handleDisconnect = async (account: WhatsAppAccount) => {
    if (!confirm(`Отключить ${account.name}?`)) return;

    try {
      await whatsappApi.disconnect(account.id);
      updateAccount(account.id, { status: 'DISCONNECTED' });
      addNotification({
        type: 'success',
        title: 'Отключено',
        message: `${account.name} успешно отключен`,
      });
    } catch (error) {
      console.error('Failed to disconnect:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка отключения',
        message: 'Не удалось отключить WhatsApp',
      });
    }
  };

  const handleReconnect = async (account: WhatsAppAccount) => {
    try {
      await whatsappApi.reconnect(account.id);
      addNotification({
        type: 'info',
        title: 'Переподключение',
        message: `${account.name} переподключается...`,
      });
    } catch (error) {
      console.error('Failed to reconnect:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка переподключения',
        message: 'Не удалось переподключить WhatsApp',
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'DISCONNECTED':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'CONNECTING':
        return <RefreshCw className="w-5 h-5 text-yellow-500 animate-spin" />;
      case 'QR_REQUIRED':
        return <QrCode className="w-5 h-5 text-orange-500" />;
      case 'ERROR':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Smartphone className="w-5 h-5 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-96">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/admin')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Назад
            </Button>
            <div>
              <h1 className="text-3xl font-bold">WhatsApp Аккаунты</h1>
              <p className="text-gray-600">Управление 4 WhatsApp подключениями</p>
            </div>
          </div>
          <Button onClick={loadAccounts} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Обновить
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {accounts.map((account) => (
            <Card key={account.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5" />
                    {account.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(account.status)}
                    <Badge 
                      className={`${whatsappStatusColors[account.status]} text-white`}
                    >
                      {whatsappStatusLabels[account.status]}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Phone Number */}
                {account.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="font-mono">{account.phone}</span>
                  </div>
                )}

                {/* Last Connected */}
                {account.lastConnectedAt && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>
                      Последнее подключение:{' '}
                      {new Date(account.lastConnectedAt).toLocaleString('ru-RU')}
                    </span>
                  </div>
                )}

                {/* Leads Count */}
                {account._count && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">Лидов:</span>
                    <span className="text-blue-600">{account._count.leads}</span>
                  </div>
                )}

                {/* Instance Name */}
                <div className="text-xs text-gray-500 font-mono">
                  Instance: {account.instanceName}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {account.status === 'CONNECTED' ? (
                    <>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleReconnect(account)}
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Переподключить
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => handleDisconnect(account)}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Отключить
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="flex-1"
                      onClick={() => handleGenerateQR(account)}
                    >
                      <QrCode className="w-4 h-4 mr-2" />
                      Подключить через QR
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* QR Code Modal */}
        <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Подключение {selectedAccount?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded text-sm">
                <p className="font-semibold mb-2">Как подключить:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Откройте WhatsApp на телефоне</li>
                  <li>Нажмите Меню (⋮) → Связанные устройства</li>
                  <li>Нажмите "Привязать устройство"</li>
                  <li>Отсканируйте QR-код ниже</li>
                </ol>
              </div>

              {qrLoading ? (
                <div className="flex items-center justify-center h-64">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              ) : qrCode ? (
                <div className="flex justify-center">
                  <div className="p-4 bg-white rounded-lg shadow-lg">
                    <img
                      src={qrCode}
                      alt="WhatsApp QR Code"
                      className="w-64 h-64"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  QR код не сгенерирован
                </div>
              )}

              <p className="text-sm text-gray-500 text-center">
                QR-код обновляется автоматически каждые 20 секунд
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
