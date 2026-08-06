import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { proceduresApi } from '../api/procedures';
import Modal from '../components/Modal';

interface ProcForm {
  name: string;
  price: string;
  keywords: string;
  description: string;
}

const empty: ProcForm = { name: '', price: '', keywords: '', description: '' };

export default function ProceduresPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState<ProcForm>(empty);

  const { data: procedures, isLoading } = useQuery({
    queryKey: ['procedures'],
    queryFn: proceduresApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => proceduresApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['procedures'] }); close(); toast.success('Процедура создана'); },
    onError: () => toast.error('Ошибка'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => proceduresApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['procedures'] }); close(); toast.success('Сохранено'); },
    onError: () => toast.error('Ошибка'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => proceduresApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['procedures'] }); toast.success('Удалено'); },
  });

  function open(mode: 'create' | 'edit', proc?: any) {
    setModal(mode);
    if (proc) {
      setSelected(proc);
      setForm({ name: proc.name, price: String(proc.price), keywords: proc.keywords.join(', '), description: proc.description || '' });
    } else {
      setSelected(null);
      setForm(empty);
    }
  }

  function close() {
    setModal(null);
    setSelected(null);
    setForm(empty);
  }

  function submit() {
    const payload = {
      name: form.name,
      price: Number(form.price),
      keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
      description: form.description || undefined,
    };
    if (modal === 'create') createMutation.mutate(payload);
    else updateMutation.mutate({ id: selected.id, data: payload });
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Процедуры</h1>
          <p className="text-gray-500 text-sm mt-0.5">Услуги и их ключевые слова</p>
        </div>
        <button onClick={() => open('create')} className="btn-primary">
          <Plus size={16} />
          Добавить процедуру
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-40 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-24" />
            </div>
          ))}
        </div>
      ) : procedures?.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">Нет процедур</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {procedures?.map((proc: any) => (
            <div key={proc.id} className={`card p-5 ${!proc.isActive ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Tag size={16} className="text-blue-600" />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => open('edit', proc)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => { if (confirm('Удалить?')) deleteMutation.mutate(proc.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900">{proc.name}</h3>
              <p className="text-blue-600 font-bold mt-1">{proc.price.toLocaleString()} ₸</p>
              {proc.description && (
                <p className="text-xs text-gray-500 mt-1">{proc.description}</p>
              )}

              {proc.keywords?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {proc.keywords.map((kw: string) => (
                    <span key={kw} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modal !== null}
        onClose={close}
        title={modal === 'create' ? 'Новая процедура' : 'Редактировать процедуру'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Название</label>
            <input className="input" placeholder="RF-лифтинг" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Цена (₸)</label>
            <input type="number" className="input" placeholder="25000" value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Ключевые слова <span className="text-gray-400 font-normal">(через запятую)</span>
            </label>
            <input className="input" placeholder="rf, лифтинг, омоложение" value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
            <p className="text-xs text-gray-400 mt-1">
              Система автоматически определит процедуру по этим словам из сообщения клиента
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Описание (опционально)</label>
            <textarea className="input resize-none" rows={2} placeholder="Описание процедуры..."
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={submit}
              disabled={createMutation.isPending || updateMutation.isPending || !form.name || !form.price}
              className="btn-primary flex-1 justify-center"
            >
              {createMutation.isPending || updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={close} className="btn-secondary flex-1 justify-center">Отмена</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
