import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Phone, TrendingUp } from 'lucide-react';
import type { Operator } from '@/types';

interface AssignOperatorModalProps {
  open: boolean;
  onClose: () => void;
  operators: Operator[];
  selectedCount: number;
  onAssign: (operatorId: string) => void;
  loading?: boolean;
}

export default function AssignOperatorModal({
  open,
  onClose,
  operators,
  selectedCount,
  onAssign,
  loading,
}: AssignOperatorModalProps) {
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>('');

  const handleAssign = () => {
    if (selectedOperatorId) {
      onAssign(selectedOperatorId);
      setSelectedOperatorId('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Назначить оператора
            {selectedCount > 0 && (
              <Badge className="ml-2" variant="secondary">
                {selectedCount} {selectedCount === 1 ? 'лид' : 'лидов'}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {operators.map((operator) => {
            const isSelected = selectedOperatorId === operator.id;
            const conversionRate = operator.totalLeads > 0 
              ? ((operator.totalBooked / operator.totalLeads) * 100).toFixed(1)
              : '0';

            return (
              <div
                key={operator.id}
                className={`
                  p-4 border rounded-lg cursor-pointer transition-all
                  ${isSelected 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }
                  ${!operator.active ? 'opacity-50' : ''}
                `}
                onClick={() => operator.active && setSelectedOperatorId(operator.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center
                      ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}
                    `}>
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {operator.user?.name || 'Оператор'}
                        </span>
                        {!operator.active && (
                          <Badge variant="secondary">Неактивен</Badge>
                        )}
                      </div>
                      {operator.user?.phone && (
                        <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                          <Phone className="w-3 h-3" />
                          {operator.user.phone}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-gray-600">Новые</div>
                    <div className="font-semibold text-blue-600">
                      {operator.currentLeads}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Всего</div>
                    <div className="font-semibold">{operator.totalLeads}</div>
                  </div>
                  <div>
                    <div className="text-gray-600 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Conv
                    </div>
                    <div className="font-semibold text-green-600">
                      {conversionRate}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {operators.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            Нет доступных операторов
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Отмена
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedOperatorId || loading}
          >
            {loading ? 'Назначение...' : 'Назначить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
