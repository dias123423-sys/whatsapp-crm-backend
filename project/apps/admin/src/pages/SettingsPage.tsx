import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Users, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { assignmentApi, usersApi } from '../api/users';
import Modal from '../components/Modal';

const STRATEGIES = [
  {
    value: 'ROUND_ROBIN',
    label: 'Round Robin',
    desc: 'Лиды раздаются операторам по очереди: Лид 1 → Айжан, Лид 2 → Мария, Лид 3 → Ольга...',
  },
  {
    value: 'LEAST_BUSY',
    label: 'Least Busy',
    desc: 'Лид уходит оператору с наименьшим числом активных лидов',
  },
  {
    value: 'MANUAL',
    label: 'Ручное',
    desc: 'Лиды не назначаются автоматически. Администратор распределяет вручную',
  },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [showUser, setShowUser] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', phone: '', password: '', role: 'OPERATOR' });

  const { data: config } = useQuery({
    queryKey: ['assignment-config'],
    queryFn: assignmentApi.getConfig,
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.getAll,
  });

  const strategyMutation = useMutation({
    mutationFn: (strategy: string) => assignmentApi.updateStrategy(strategy),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assignment-config'] }); toast.success('Стратегия обновлена'); },
  });

  const createUserMutation = useMutation({
    mutationFn: (data: any) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowUser(false);
      setUserForm({ name: '', email: '', phone: '', password: '', role: 'OPERATOR' });
      toast.success('Пользователь создан');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Ошибка'),
  });

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>
        <p className="text-gray-500 text-sm mt-0.5">Конфигурация системы</p>
      </div>

      {/* Assignment Strategy */}
      <div className="card p-6 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
            <RefreshCw size={17} className="text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Распределение лидов</h2>
            <p className="text-xs text-gray-500">Как новые лиды назначаются операторам</p>
          </div>
        </div>

        <div className="space-y-3">
          {STRATEGIES.map((s) => (
            <label
              key={s.value}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${
                config?.strategy === s.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="strategy"
                value={s.value}
                checked={config?.strategy === s.value}
                onChange={() => strategyMutation.mutate(s.value)}
                className="mt-0.5"
              />
              <div>
                <p className="font-medium text-gray-900 text-sm">{s.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Users */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users size={17} className="text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Пользователи</h2>
              <p className="text-xs text-gray-500">Все аккаунты системы</p>
            </div>
          </div>
          <button onClick={() => setShowUser(true)} className="btn-primary text-xs px-3 py-1.5">
            + Добавить
          </button>
        </div>

        <div className="space-y-2">
          {users?.map((u: any) => (
            <div key={u.id} className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
                  {u.name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{u.name}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {u.role}
                </span>
                <span className={`badge ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {u.isActive ? 'Активен' : 'Неактивен'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create user modal */}
      <Modal open={showUser} onClose={() => setShowUser(false)} title="Новый пользователь" size="sm">
        <div className="space-y-4">
          {[
            { key: 'name', label: 'Имя', type: 'text', placeholder: 'Имя' },
            { key: 'email', label: 'Email', type: 'email', placeholder: 'email@example.kz' },
            { key: 'phone', label: 'Телефон', type: 'text', placeholder: '+77001112233' },
            { key: 'password', label: 'Пароль', type: 'password', placeholder: '••••••••' },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
              <input type={type} className="input" placeholder={placeholder}
                value={(userForm as any)[key]}
                onChange={(e) => setUserForm({ ...userForm, [key]: e.target.value })} />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Роль</label>
            <select className="input" value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
              <option value="OPERATOR">Оператор</option>
              <option value="ADMIN">Администратор</option>
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => createUserMutation.mutate(userForm)}
              disabled={createUserMutation.isPending}
              className="btn-primary flex-1 justify-center"
            >
              {createUserMutation.isPending ? 'Создание...' : 'Создать'}
            </button>
            <button onClick={() => setShowUser(false)} className="btn-secondary flex-1 justify-center">
              Отмена
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
