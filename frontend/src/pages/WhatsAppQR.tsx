import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/store';
import { ArrowLeft, Smartphone, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const EVOLUTION_API_URL = 'https://188-241-217-76.nip.io/evolution';
const EVOLUTION_API_KEY = 'evolution-key-2026';
const INSTANCE_NAME = 'callcenter-main';

interface ConnectionStatus {
  state: 'connecting' | 'open' | 'close';
  statusReason?: string;
}

export default function WhatsAppQR() {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const [qrCode, setQrCode] = useState<string>('');
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      navigate('/');
      return;
    }
    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [user, navigate]);

  const checkStatus = async () => {
    try {
      const response = await fetch(
        `${EVOLUTION_API_URL}/instance/connectionState/${INSTANCE_NAME}`,
        {
          headers: {
            'apikey': EVOLUTION_API_KEY,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        if (data.state === 'close' && !qrCode) {
          // Auto-generate QR if disconnected
          generateQR();
        }
      }
    } catch (err) {
      console.error('Status check failed:', err);
    }
  };

  const createInstance = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          instanceName: INSTANCE_NAME,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create instance');
      }

      await generateQR();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create instance');
    } finally {
      setLoading(false);
    }
  };

  const generateQR = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `${EVOLUTION_API_URL}/instance/connect/${INSTANCE_NAME}`,
        {
          method: 'GET',
          headers: {
            'apikey': EVOLUTION_API_KEY,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate QR code');
      }

      const data = await response.json();
      if (data.base64) {
        setQrCode(data.base64);
      } else if (data.code) {
        setQrCode(data.code);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate QR code');
      // Try to create instance if it doesn't exist
      await createInstance();
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    setLoading(true);
    setError('');
    try {
      await fetch(`${EVOLUTION_API_URL}/instance/logout/${INSTANCE_NAME}`, {
        method: 'DELETE',
        headers: {
          'apikey': EVOLUTION_API_KEY,
        },
      });
      setQrCode('');
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (!status) {
      return <Badge variant="outline">Проверка...</Badge>;
    }

    switch (status.state) {
      case 'open':
        return (
          <Badge className="bg-green-500 text-white">
            <CheckCircle className="w-3 h-3 mr-1" />
            Подключен
          </Badge>
        );
      case 'connecting':
        return (
          <Badge className="bg-yellow-500 text-white">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            Подключение...
          </Badge>
        );
      case 'close':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Отключен
          </Badge>
        );
      default:
        return <Badge variant="outline">Неизвестно</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="outline"
          onClick={() => navigate('/admin')}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад в панель
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-6 h-6" />
                WhatsApp Подключение
              </CardTitle>
              {getStatusBadge()}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {status?.state === 'open' ? (
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">WhatsApp подключен!</h3>
                <p className="text-gray-600 mb-4">
                  Система готова принимать сообщения
                </p>
                <Button
                  variant="destructive"
                  onClick={disconnect}
                  disabled={loading}
                >
                  Отключить WhatsApp
                </Button>
              </div>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
                  <p className="font-semibold mb-2">Как подключить WhatsApp:</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Откройте WhatsApp на телефоне</li>
                    <li>Нажмите Меню (⋮) → Связанные устройства</li>
                    <li>Нажмите "Привязать устройство"</li>
                    <li>Отсканируйте QR-код ниже</li>
                  </ol>
                </div>

                {qrCode ? (
                  <div className="text-center">
                    <div className="inline-block p-4 bg-white rounded-lg shadow-lg">
                      <img
                        src={qrCode}
                        alt="WhatsApp QR Code"
                        className="w-64 h-64"
                      />
                    </div>
                    <p className="text-sm text-gray-500 mt-4">
                      QR-код обновляется автоматически
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Button
                      onClick={generateQR}
                      disabled={loading}
                      size="lg"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Генерация...
                        </>
                      ) : (
                        <>
                          <Smartphone className="w-4 h-4 mr-2" />
                          Сгенерировать QR-код
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {qrCode && (
                  <Button
                    variant="outline"
                    onClick={generateQR}
                    disabled={loading}
                    className="w-full"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Обновить QR-код
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Информация о подключении</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Статус:</span>
                <span className="font-medium">
                  {status?.state || 'Не подключен'}
                </span>
              </div>
              {status?.statusReason && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Причина:</span>
                  <span className="font-medium">{status.statusReason}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Instance:</span>
                <span className="font-mono text-xs">{INSTANCE_NAME}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
