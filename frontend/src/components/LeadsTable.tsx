import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, User, Package, DollarSign, Clock, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Lead } from '@/types';
import { leadStatusLabels, leadStatusColors } from '@/types';

interface LeadsTableProps {
  leads: Lead[];
  selectedLeads: Set<string>;
  onSelectLead: (id: string) => void;
  onSelectAll: () => void;
  onAssign: (lead: Lead) => void;
  onStatusChange: (lead: Lead) => void;
  loading?: boolean;
}

export default function LeadsTable({
  leads,
  selectedLeads,
  onSelectLead,
  onSelectAll,
  onAssign,
  onStatusChange,
  loading,
}: LeadsTableProps) {
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const allSelected = leads.length > 0 && leads.every((lead) => selectedLeads.has(lead.id));

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (loading) {
    return (
      <div className="border rounded-lg">
        <div className="p-8 text-center text-gray-500">
          Загрузка лидов...
        </div>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="border rounded-lg">
        <div className="p-8 text-center text-gray-500">
          Лидов нет
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onSelectAll}
              />
            </TableHead>
            <TableHead className="w-16">№</TableHead>
            <TableHead>Телефон</TableHead>
            <TableHead>Имя</TableHead>
            <TableHead>Процедура</TableHead>
            <TableHead>Цена</TableHead>
            <TableHead>WhatsApp</TableHead>
            <TableHead>Оператор</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Дата</TableHead>
            <TableHead>Время</TableHead>
            <TableHead className="w-20">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead, index) => (
            <TableRow
              key={lead.id}
              className="hover:bg-gray-50 cursor-pointer"
              onClick={() => navigate(`/leads/${lead.id}`)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedLeads.has(lead.id)}
                  onCheckedChange={() => onSelectLead(lead.id)}
                />
              </TableCell>
              <TableCell className="text-gray-500 font-mono text-sm">
                {index + 1}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-600" />
                  <a
                    href={`tel:${lead.phone}`}
                    className="font-semibold text-blue-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {lead.phone}
                  </a>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span>{lead.whatsappName || lead.client?.name || '—'}</span>
                </div>
              </TableCell>
              <TableCell>
                {lead.procedures && lead.procedures.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {lead.procedures.map((proc) => (
                      <div key={proc.id} className="flex items-center gap-1 text-sm">
                        <Package className="w-3 h-3 text-purple-600" />
                        <span>{proc.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400">Не определена</span>
                )}
              </TableCell>
              <TableCell>
                {lead.price ? (
                  <div className="flex items-center gap-1 font-semibold text-green-600">
                    <DollarSign className="w-4 h-4" />
                    {lead.price.toLocaleString()} {lead.currency || '₸'}
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>
              <TableCell>
                {lead.whatsappAccount ? (
                  <Badge variant="outline" className="text-xs">
                    {lead.whatsappAccount.name}
                  </Badge>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>
              <TableCell>
                {lead.operator ? (
                  <span className="text-sm">{lead.operator.user?.name}</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssign(lead);
                    }}
                  >
                    Назначить
                  </Button>
                )}
              </TableCell>
              <TableCell>
                <Badge className={leadStatusColors[lead.status]}>
                  {leadStatusLabels[lead.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                {formatDate(lead.createdAt)}
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(lead.createdAt)}
                </div>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenMenuId(openMenuId === lead.id ? null : lead.id)}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
                {openMenuId === lead.id && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border">
                    <div className="py-1">
                      <button
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        onClick={() => {
                          navigate(`/leads/${lead.id}`);
                          setOpenMenuId(null);
                        }}
                      >
                        Открыть
                      </button>
                      <button
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        onClick={() => {
                          onAssign(lead);
                          setOpenMenuId(null);
                        }}
                      >
                        Назначить оператора
                      </button>
                      <button
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        onClick={() => {
                          onStatusChange(lead);
                          setOpenMenuId(null);
                        }}
                      >
                        Изменить статус
                      </button>
                    </div>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
