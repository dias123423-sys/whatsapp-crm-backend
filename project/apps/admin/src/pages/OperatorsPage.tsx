import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { operatorsApi } from '../api/operators';
import { usersApi } from '../api/users';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';

export default function OperatorsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });

  const { data: operators, isLoading } = useQuery({
    queryKey: ['operators'],
    queryFn: operatorsApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => usersApi.create({ ...data, role: 'OPERATOR' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operators'] });
      setShowCreate(false);
      setForm({ name: '', email: '', phone: '', password: '' });
      toast.success('Оператор создан');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Ошибка'),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: any) => operatorsApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operators'] });
      toast.success('Статус обновлён');
    },
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Операторы</h1>
          <p className="text-gray-500 text-sm mt-0.5">Управление операторами</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <UserPlus size={16} />
          Добавить оператора
        </button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-32 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-24" />
            </div>
          ))}
        </div>
      ) : operators?.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          Нет операторов. Создайте первого.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {operators?.map((op: any) => (
            <div key={op.id} className="card p-5">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-base">
                    {op.name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{op.name}</p>
                    <p className="text-xs text-gray-400">{op.phone || op.user?.email}</p>
                  </div>
                </div>
                <StatusBadge status={op.status} />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'Лидов', value: op._count?.leads ?? 0 },
                  { label: 'Звонков', value: '—' },
                  { label: 'Записей', value: '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-gray-900">{value}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>

              {/* Toggle */}
              <button
                onClick={() =>
                  toggleStatus.mutate({
                    id: op.id,
                    status: op.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                  })
                }
                className={`w-full btn text-sm justify-center ${
                  op.status === 'ACTIVE'
                    ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                    : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200'
                }`}
              >
                {op.status === 'ACTIVE' ? 'Деактивировать' : 'Активировать'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Новый оператор">
        <div className="space-y-4">
          {[
            { key: 'name', label: 'Имя', placeholder: 'Айжан', type: 'text' },
            { key: 'email', label: 'Email', placeholder: 'aizhan@callcenter.kz', type: 'email' },
            { key: 'phone', label: 'Телефон', placeholder: '+77001112233', type: 'text' },
            { key: 'password', label: 'Пароль', placeholder: '••••••••', type: 'password' },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
              <input
                type={type}
                className="input"
                placeholder={placeholder}
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.name || !form.email || !form.password}
              className="btn-primary flex-1 justify-center"
            >
              {createMutation.isPending ? 'Создание...' : 'Создать'}
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1 justify-center">
              Отмена
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
