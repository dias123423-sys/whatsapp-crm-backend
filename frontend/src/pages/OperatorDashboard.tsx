import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { leadsApi } from '@/lib/api';
import { useAuth, useLeads } from '@/lib/store';
import { formatDate, formatPhone, leadStatusColors, leadStatusLabels } from '@/lib/utils';
import { Phone, LogOut, CheckCircle, Clock, XCircle, MessageSquare } from 'lucide-react';
import type { Lead, LeadStatus } from '@/types';

export default function OperatorDashboard() {
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const { leads, setLeads, selectedLead, setSelectedLead } = useLeads();
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadLeads();
    const interval = setInterval(loadLeads, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadLeads = async () => {
    try {
      const { data } = await leadsApi.getAll({ operatorId: user?.operator?.id });
      setLeads(data.data || data || []);
    } catch (error) {
      console.error('Error loading leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (leadId: string, status: LeadStatus) => {
    try {
      await leadsApi.updateStatus(leadId, status, notes);
      setNotes('');
      setSelectedLead(null);
      loadLeads();
    } catch (error) {
      alert('Ошибка обновления статуса');
    }
  };

  const myLeads = leads.filter((l: Lead) => l.operatorId === user?.operator?.id);
  const activeLeads = myLeads.filter((l: Lead) => !['BOOKED', 'CLOSED'].includes(l.status));

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Загрузка...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                <Phone className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Мои Лиды</h1>
                <p className="text-sm text-gray-500">{user?.name}</p>
              </div>
            </div>
            <Button variant="outline" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" />
              Выйти
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Активные лиды</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{activeLeads.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Всего лидов</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{myLeads.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Записано</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {myLeads.filter((l: Lead) => l.status === 'BOOKED').length}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Лиды для обработки ({activeLeads.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activeLeads.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">Нет активных лидов</p>
                  ) : (
                    activeLeads.map((lead: Lead) => (
                      <div
                        key={lead.id}
                        className={`border rounded-lg p-4 cursor-pointer transition ${
                          selectedLead?.id === lead.id ? 'bg-green-50 border-green-500' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedLead(lead)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-lg">
                              {lead.client.whatsappName || lead.client.name || 'Без имени'}
                            </p>
                            <a
                              href={`tel:${lead.client.phone}`}
                              className="text-lg text-green-600 font-medium hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {formatPhone(lead.client.phone)}
                            </a>
                          </div>
                          <Badge className={leadStatusColors[lead.status]}>
                            {leadStatusLabels[lead.status]}
                          </Badge>
                        </div>
                        {lead.message && (
                          <div className="bg-gray-50 p-3 rounded mb-2">
                            <p className="text-sm text-gray-700">{lead.message}</p>
                          </div>
                        )}
                        {lead.procedure && (
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="secondary">{lead.procedure.name}</Badge>
                            <span className="text-sm font-medium text-green-600">
                              {lead.procedure.price.toLocaleString()} ₸
                            </span>
                          </div>
                        )}
                        {lead.notes && (
                          <p className="text-sm text-gray-600 italic mb-2">💬 {lead.notes}</p>
                        )}
                        <p className="text-xs text-gray-500">{formatDate(lead.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>Действия</CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedLead ? (
                  <p className="text-sm text-gray-500 text-center py-8">Выберите лид для обработки</p>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-green-50 p-3 rounded">
                      <p className="font-semibold text-sm mb-1">
                        {selectedLead.client.whatsappName || selectedLead.client.name}
                      </p>
                      <a
                        href={`tel:${selectedLead.client.phone}`}
                        className="text-green-600 font-medium hover:underline"
                      >
                        {formatPhone(selectedLead.client.phone)}
                      </a>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Заметки</label>
                      <Input
                        placeholder="Добавить заметку..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Button
                        className="w-full"
                        onClick={() => updateStatus(selectedLead.id, 'CALLING')}
                      >
                        <Phone className="w-4 h-4 mr-2" />
                        Звоню
                      </Button>
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700"
                        onClick={() => updateStatus(selectedLead.id, 'BOOKED')}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Записан
                      </Button>
                      <Button
                        className="w-full"
                        variant="secondary"
                        onClick={() => updateStatus(selectedLead.id, 'FOLLOW_UP')}
                      >
                        <Clock className="w-4 h-4 mr-2" />
                        Перезвонить
                      </Button>
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => updateStatus(selectedLead.id, 'NO_ANSWER')}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Не отвечает
                      </Button>
                      <Button
                        className="w-full"
                        variant="destructive"
                        onClick={() => updateStatus(selectedLead.id, 'CLOSED')}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Закрыть
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
