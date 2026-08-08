import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { leadsApi } from '@/lib/api';
import { useNotifications } from '@/lib/store';
import { 
  ArrowLeft, 
  Phone, 
  User, 
  Package, 
  DollarSign, 
  Calendar, 
  Clock,
  Smartphone,
  MessageSquare,
  Save,
  Tag,
  TrendingUp
} from 'lucide-react';
import type { Lead, LeadStatus } from '@/types';
import { leadStatusLabels, leadStatusColors } from '@/types';

export default function LeadDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addNotification = useNotifications((state) => state.addNotification);
  
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<LeadStatus>('NEW');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (id) {
      loadLead();
    }
  }, [id]);

  const loadLead = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      const response = await leadsApi.getOne(id);
      setLead(response.data);
      setStatus(response.data.status);
      setNotes(response.data.notes || '');
    } catch (error) {
      console.error('Failed to load lead:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка загрузки',
        message: 'Не удалось загрузить лид',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!id) return;

    try {
      setSaving(true);
      await leadsApi.updateStatus(id, status, notes);
      addNotification({
        type: 'success',
        title: 'Сохранено',
        message: 'Изменения успешно сохранены',
      });
      loadLead();
    } catch (error) {
      console.error('Failed to update lead:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка сохранения',
        message: 'Не удалось сохранить изменения',
      });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-96">
            <div className="text-gray-500">Загрузка...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <div className="mt-8 text-center text-gray-500">
            Лид не найден
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <Badge className={leadStatusColors[lead.status]}>
            {leadStatusLabels[lead.status]}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Card */}
            <Card>
              <CardHeader>
                <CardTitle>Контактная информация</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Phone - PRIORITY #1 */}
                <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
                  <Phone className="w-8 h-8 text-blue-600" />
                  <div className="flex-1">
                    <div className="text-sm text-gray-600">Телефон</div>
                    <a
                      href={`tel:${lead.phone}`}
                      className="text-xl font-bold text-blue-600 hover:underline"
                    >
                      {lead.phone}
                    </a>
                  </div>
                  <Button asChild>
                    <a href={`tel:${lead.phone}`}>
                      <Phone className="w-4 h-4 mr-2" />
                      Позвонить
                    </a>
                  </Button>
                </div>

                {/* Name */}
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="text-sm text-gray-600">Имя</div>
                    <div className="font-semibold">
                      {lead.whatsappName || lead.client?.name || '—'}
                    </div>
                  </div>
                </div>

                {/* WhatsApp Account */}
                {lead.whatsappAccount && (
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-600">WhatsApp аккаунт</div>
                      <Badge variant="outline">{lead.whatsappAccount.name}</Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Procedures & Price - PRIORITY #2 & #3 */}
            <Card>
              <CardHeader>
                <CardTitle>Процедуры и цена</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Procedures */}
                <div>
                  <div className="text-sm text-gray-600 mb-2">Процедуры</div>
                  {lead.procedures && lead.procedures.length > 0 ? (
                    <div className="space-y-2">
                      {lead.procedures.map((proc) => (
                        <div
                          key={proc.id}
                          className="flex items-center justify-between p-3 bg-purple-50 rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <Package className="w-5 h-5 text-purple-600" />
                            <span className="font-medium">{proc.name}</span>
                          </div>
                          <span className="text-purple-600 font-semibold">
                            {proc.price.toLocaleString()} {proc.currency}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-lg text-gray-500 text-center">
                      Процедура не определена
                    </div>
                  )}
                </div>

                {/* Total Price */}
                {lead.price && (
                  <div className="flex items-center gap-4 p-4 bg-green-50 rounded-lg">
                    <DollarSign className="w-8 h-8 text-green-600" />
                    <div>
                      <div className="text-sm text-gray-600">Общая цена</div>
                      <div className="text-2xl font-bold text-green-600">
                        {lead.price.toLocaleString()} {lead.currency || '₸'}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Original Message */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Исходное сообщение
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
                  {lead.originalMessage}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status & Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Управление</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Status */}
                <div>
                  <label className="text-sm text-gray-600 mb-2 block">
                    Статус
                  </label>
                  <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NEW">Новый</SelectItem>
                      <SelectItem value="ASSIGNED">Назначен</SelectItem>
                      <SelectItem value="CALLING">Звоню</SelectItem>
                      <SelectItem value="BOOKED">Записан</SelectItem>
                      <SelectItem value="FOLLOW_UP">Перезвонить</SelectItem>
                      <SelectItem value="NO_ANSWER">Не ответил</SelectItem>
                      <SelectItem value="CLOSED">Закрыт</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-sm text-gray-600 mb-2 block">
                    Заметки
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full h-32 px-3 py-2 border rounded-md resize-none"
                    placeholder="Добавьте заметки о звонке..."
                  />
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </CardContent>
            </Card>

            {/* Meta Info */}
            <Card>
              <CardHeader>
                <CardTitle>Информация</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {/* Operator */}
                {lead.operator && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-gray-600">Оператор</div>
                      <div className="font-medium">{lead.operator.user?.name}</div>
                    </div>
                  </div>
                )}

                {/* Source */}
                {lead.source && (
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-gray-600">Источник</div>
                      <div className="font-medium">{lead.source}</div>
                    </div>
                  </div>
                )}

                {/* Campaign */}
                {lead.campaign && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-gray-600">Кампания</div>
                      <div className="font-medium">{lead.campaign}</div>
                    </div>
                  </div>
                )}

                {/* Created */}
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <div>
                    <div className="text-gray-600">Создан</div>
                    <div className="font-medium">{formatDate(lead.createdAt)}</div>
                  </div>
                </div>

                {/* Updated */}
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <div>
                    <div className="text-gray-600">Обновлен</div>
                    <div className="font-medium">{formatDate(lead.updatedAt)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
