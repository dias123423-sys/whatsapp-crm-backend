import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/lib/store';
import { reportsApi } from '@/api/reports.api';
import { 
  ArrowLeft, 
  Download, 
  TrendingUp, 
  Users, 
  DollarSign,
  Package,
  Phone,
  Calendar
} from 'lucide-react';
import type { Report, ReportPeriod } from '@/types';

export default function ReportsPage() {
  const navigate = useNavigate();
  const addNotification = useNotifications((state) => state.addNotification);
  
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [report, setReport] = useState<Report | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadReport();
  }, [period]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const response = await reportsApi.getReport({
        period,
        dateFrom: period === 'custom' ? dateFrom : undefined,
        dateTo: period === 'custom' ? dateTo : undefined,
      });
      setReport(response.data);
    } catch (error) {
      console.error('Failed to load report:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка загрузки',
        message: 'Не удалось загрузить отчёт',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = async () => {
    try {
      const response = await reportsApi.downloadExcel({
        period,
        dateFrom: period === 'custom' ? dateFrom : undefined,
        dateTo: period === 'custom' ? dateTo : undefined,
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${period}_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      addNotification({
        type: 'success',
        title: 'Excel скачан',
        message: 'Отчёт успешно скачан',
      });
    } catch (error) {
      console.error('Failed to download Excel:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка скачивания',
        message: 'Не удалось скачать Excel',
      });
    }
  };

  const handleDownloadNightReport = async () => {
    try {
      const response = await reportsApi.getNightReport();
      // TODO: handle night report download
      addNotification({
        type: 'success',
        title: 'Ночной отчёт',
        message: 'Отчёт загружен',
      });
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Ошибка',
        message: 'Не удалось загрузить ночной отчёт',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">Загрузка отчёта...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate('/admin')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Назад
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Отчёты</h1>
              <p className="text-gray-600">Статистика и аналитика</p>
            </div>
          </div>
          <Button onClick={handleDownloadExcel}>
            <Download className="w-4 h-4 mr-2" />
            Скачать Excel
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
                <SelectTrigger>
                  <SelectValue placeholder="Период" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Сегодня</SelectItem>
                  <SelectItem value="yesterday">Вчера</SelectItem>
                  <SelectItem value="week">Неделя</SelectItem>
                  <SelectItem value="month">Месяц</SelectItem>
                  <SelectItem value="night">Ночной (19:00-09:00)</SelectItem>
                  <SelectItem value="day">Дневной (00:00-20:00)</SelectItem>
                  <SelectItem value="custom">Выбрать даты</SelectItem>
                </SelectContent>
              </Select>

              {period === 'custom' && (
                <>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-3 py-2 border rounded-md"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-3 py-2 border rounded-md"
                  />
                  <Button onClick={loadReport}>Применить</Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {report && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Всего лидов</CardTitle>
                  <Users className="h-4 w-4 text-gray-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{report.totalLeads}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Записано</CardTitle>
                  <Phone className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{report.bookedLeads}</div>
                  <p className="text-xs text-gray-500">
                    Conversion: {report.conversionRate.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Выручка</CardTitle>
                  <DollarSign className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    {report.totalRevenue.toLocaleString()} ₸
                  </div>
                  <p className="text-xs text-gray-500">
                    Средний чек: {report.averagePrice.toLocaleString()} ₸
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Не ответили</CardTitle>
                  <Phone className="h-4 w-4 text-gray-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-600">{report.noAnswerLeads}</div>
                </CardContent>
              </Card>
            </div>

            {/* By WhatsApp */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>По WhatsApp аккаунтам</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.byWhatsApp.map((wa) => (
                    <div key={wa.accountId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-semibold">{wa.accountName}</div>
                        <div className="text-sm text-gray-600">
                          Лидов: {wa.leadsCount} | Записано: {wa.bookedCount}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">
                          {wa.leadsCount > 0 ? ((wa.bookedCount / wa.leadsCount) * 100).toFixed(1) : 0}%
                        </div>
                        <div className="text-xs text-gray-500">Conversion</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* By Procedure */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>По процедурам</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.byProcedure.map((proc) => (
                    <div key={proc.procedureId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-purple-600" />
                        <div>
                          <div className="font-semibold">{proc.procedureName}</div>
                          <div className="text-sm text-gray-600">
                            Лидов: {proc.count} | Записано: {proc.bookedCount}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-purple-600">
                          {proc.totalPrice.toLocaleString()} ₸
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* By Operator */}
            <Card>
              <CardHeader>
                <CardTitle>По операторам</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.byOperator.map((op) => (
                    <div key={op.operatorId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-600" />
                        <div>
                          <div className="font-semibold">{op.operatorName}</div>
                          <div className="text-sm text-gray-600">
                            Лидов: {op.leadsCount} | Записано: {op.bookedCount}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">
                          {op.conversionRate.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">Conversion</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
