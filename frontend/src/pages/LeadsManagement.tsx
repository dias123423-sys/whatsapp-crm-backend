import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth, useLeads, useWhatsApp, useOperators, useNotifications } from '@/lib/store';
import { leadsApi, operatorsApi, whatsappApi } from '@/lib/api';
import { socketClient } from '@/lib/socket';
import LeadsTable from '@/components/LeadsTable';
import AssignOperatorModal from '@/components/AssignOperatorModal';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  Download, 
  UserPlus, 
  RefreshCw,
  ArrowLeft,
  Calendar
} from 'lucide-react';
import type { Lead, LeadFilters, LeadStatus } from '@/types';

export default function LeadsManagement() {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const { leads, setLeads, addLead, updateLead, selectedLeads, toggleSelectLead, selectAllLeads, clearSelection } = useLeads();
  const { accounts, setAccounts } = useWhatsApp();
  const { operators, setOperators } = useOperators();
  const addNotification = useNotifications((state) => state.addNotification);

  const [loading, setLoading] = useState(true);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filters, setFilters] = useState<LeadFilters>({
    page: 1,
    limit: 20,
  });
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      navigate('/');
      return;
    }

    loadData();

    // Setup WebSocket listeners
    const unsubscribeCreated = socketClient.on('lead.created', (data: Lead) => {
      addLead(data);
      addNotification({
        type: 'info',
        title: 'Новый лид',
        message: `${data.phone} - ${data.procedures?.map(p => p.name).join(', ') || 'Процедура не определена'}`,
      });
    });

    const unsubscribeUpdated = socketClient.on('lead.updated', (data: Lead) => {
      updateLead(data.id, data);
    });

    const unsubscribeAssigned = socketClient.on('lead.assigned', (data: { lead: Lead }) => {
      updateLead(data.lead.id, data.lead);
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeAssigned();
    };
  }, [user, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [leadsRes, operatorsRes, whatsappRes] = await Promise.all([
        leadsApi.getAll(filters),
        operatorsApi.getAll(),
        whatsappApi.getAll(),
      ]);

      const leadsData = leadsRes.data.data || leadsRes.data || [];
      setLeads(Array.isArray(leadsData) ? leadsData : []);
      
      const operatorsData = operatorsRes.data;
      setOperators(Array.isArray(operatorsData) ? operatorsData : []);
      
      setAccounts(whatsappRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка загрузки',
        message: 'Не удалось загрузить данные',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setFilters({ ...filters, search, page: 1 });
    loadData();
  };

  const handleFilterChange = (key: keyof LeadFilters, value: any) => {
    setFilters({ ...filters, [key]: value, page: 1 });
    setTimeout(loadData, 300);
  };

  const handleAssignSingle = (lead: Lead) => {
    setSelectedLead(lead);
    clearSelection();
    setAssignModalOpen(true);
  };

  const handleAssignBulk = () => {
    if (selectedLeads.size === 0) {
      addNotification({
        type: 'warning',
        title: 'Выберите лиды',
        message: 'Выберите хотя бы один лид для назначения',
      });
      return;
    }
    setSelectedLead(null);
    setAssignModalOpen(true);
  };

  const handleAssign = async (operatorId: string) => {
    try {
      if (selectedLead) {
        // Single assignment
        await leadsApi.assign(selectedLead.id, operatorId);
        updateLead(selectedLead.id, { operatorId });
        addNotification({
          type: 'success',
          title: 'Лид назначен',
          message: 'Оператор успешно назначен',
        });
      } else if (selectedLeads.size > 0) {
        // Bulk assignment
        const leadIds = Array.from(selectedLeads);
        await leadsApi.assignBulk(leadIds, operatorId);
        leadIds.forEach(id => updateLead(id, { operatorId }));
        addNotification({
          type: 'success',
          title: 'Лиды назначены',
          message: `${leadIds.length} лидов назначено оператору`,
        });
        clearSelection();
      }
      setAssignModalOpen(false);
      loadData();
    } catch (error) {
      console.error('Failed to assign leads:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка назначения',
        message: 'Не удалось назначить лиды',
      });
    }
  };

  const handleDownloadExcel = async () => {
    try {
      const response = await leadsApi.getAll({ ...filters, format: 'excel' });
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leads_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      addNotification({
        type: 'success',
        title: 'Excel скачан',
        message: 'Файл успешно скачан',
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
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
              <h1 className="text-3xl font-bold">Все лиды</h1>
              <p className="text-gray-600">Управление входящими лидами</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleDownloadExcel} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Excel
            </Button>
            <Button onClick={loadData} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Обновить
            </Button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Поиск по телефону, имени, процедуре..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Status Filter */}
            <Select
              value={filters.status || ''}
              onValueChange={(value) => handleFilterChange('status', value || undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все статусы</SelectItem>
                <SelectItem value="NEW">Новый</SelectItem>
                <SelectItem value="ASSIGNED">Назначен</SelectItem>
                <SelectItem value="CALLING">Звоню</SelectItem>
                <SelectItem value="BOOKED">Записан</SelectItem>
                <SelectItem value="FOLLOW_UP">Перезвонить</SelectItem>
                <SelectItem value="NO_ANSWER">Не ответил</SelectItem>
                <SelectItem value="CLOSED">Закрыт</SelectItem>
              </SelectContent>
            </Select>

            {/* WhatsApp Filter */}
            <Select
              value={filters.whatsappAccountId || ''}
              onValueChange={(value) => handleFilterChange('whatsappAccountId', value || undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="WhatsApp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все WhatsApp</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Operator Filter */}
            <Select
              value={filters.operatorId || ''}
              onValueChange={(value) => handleFilterChange('operatorId', value || undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Оператор" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все операторы</SelectItem>
                <SelectItem value="unassigned">Не назначен</SelectItem>
                {operators.map((op) => (
                  <SelectItem key={op.id} value={op.id}>
                    {op.user?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedLeads.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between">
            <span className="text-blue-900 font-medium">
              Выбрано: {selectedLeads.size} {selectedLeads.size === 1 ? 'лид' : 'лидов'}
            </span>
            <div className="flex gap-2">
              <Button onClick={clearSelection} variant="outline">
                Отменить
              </Button>
              <Button onClick={handleAssignBulk}>
                <UserPlus className="w-4 h-4 mr-2" />
                Назначить оператору
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <LeadsTable
          leads={leads}
          selectedLeads={selectedLeads}
          onSelectLead={toggleSelectLead}
          onSelectAll={selectAllLeads}
          onAssign={handleAssignSingle}
          onStatusChange={(lead) => navigate(`/leads/${lead.id}`)}
          loading={loading}
        />

        {/* Assign Operator Modal */}
        <AssignOperatorModal
          open={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          operators={operators}
          selectedCount={selectedLead ? 1 : selectedLeads.size}
          onAssign={handleAssign}
        />
      </div>
    </div>
  );
}
