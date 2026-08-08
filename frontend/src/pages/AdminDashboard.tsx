import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { leadsApi, operatorsApi, dashboardApi } from '@/lib/api';
import { useAuth, useLeads } from '@/lib/store';
import { formatDate, formatPhone, leadStatusColors, leadStatusLabels } from '@/lib/utils';
import { Users, LogOut, UserPlus, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Lead, Operator, DashboardStats } from '@/types';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const { leads, setLeads } = useLeads();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOperator, setSelectedOperator] = useState<string>('');

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [leadsRes, operatorsRes, statsRes] = await Promise.all([
        leadsApi.getAll({ status: 'NEW' }),
        operatorsApi.getAll(),
        dashboardApi.getStats(),
      ]);
      setLeads(leadsRes.data.data || leadsRes.data || []);
      setOperators(Array.isArray(operatorsRes.data) ? operatorsRes.data : []);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const assignLead = async (leadId: string) => {
    if (!selectedOperator) {
      alert('Выберите оператора');
      return;
    }
    try {
      await leadsApi.assign(leadId, selectedOperator);
      loadData();
      setSelectedOperator('');
    } catch (error) {
      alert('Ошибка назначения');
    }
  };

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
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Админ Панель</h1>
                <p className="text-sm text-gray-500">{user?.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/whatsapp-qr')}>
                <Smartphone className="w-4 h-4 mr-2" />
                WhatsApp QR
              </Button>
              <Button variant="outline" onClick={logout}>
                <LogOut className="w-4 h-4 mr-2" />
                Выйти
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Всего лидов</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.totalLeads || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Новые</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats?.newLeads || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Записано</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats?.bookedLeads || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Конверсия</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{stats?.conversionRate || 0}%</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Новые лиды ({leads.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leads.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">Нет новых лидов</p>
                  ) : (
                    leads.map((lead: Lead) => (
                      <div key={lead.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold">{lead.client.whatsappName || lead.client.name || 'Без имени'}</p>
                            <p className="text-sm text-gray-600">{formatPhone(lead.client.phone)}</p>
                          </div>
                          <Badge className={leadStatusColors[lead.status]}>
                            {leadStatusLabels[lead.status]}
                          </Badge>
                        </div>
                        {lead.message && (
                          <p className="text-sm text-gray-700 mb-2">{lead.message}</p>
                        )}
                        {lead.procedure && (
                          <p className="text-sm text-green-600 mb-2">
                            {lead.procedure.name} - {lead.procedure.price.toLocaleString()} ₸
                          </p>
                        )}
                        <div className="flex gap-2 items-center">
                          <select
                            className="flex-1 border rounded px-3 py-2 text-sm"
                            value={selectedOperator}
                            onChange={(e) => setSelectedOperator(e.target.value)}
                          >
                            <option value="">Выбрать оператора</option>
                            {operators.map((op: Operator) => (
                              <option key={op.id} value={op.id}>
                                Оператор {op.id.slice(0, 8)} ({op.currentLeads} лидов)
                              </option>
                            ))}
                          </select>
                          <Button size="sm" onClick={() => assignLead(lead.id)}>
                            <UserPlus className="w-4 h-4 mr-1" />
                            Назначить
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">{formatDate(lead.createdAt)}</p>
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
                <CardTitle>Операторы ({operators.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {operators.map((op: Operator) => (
                    <div key={op.id} className="border rounded-lg p-3">
                      <p className="font-medium text-sm mb-2">Оператор {op.id.slice(0, 8)}</p>
                      <div className="space-y-1 text-xs text-gray-600">
                        <p>Текущие: {op.currentLeads}</p>
                        <p>Всего: {op.totalLeads}</p>
                        <p>Записано: {op.totalBooked}</p>
                        <div className={`inline-block px-2 py-1 rounded ${op.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {op.active ? 'Активен' : 'Неактивен'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
