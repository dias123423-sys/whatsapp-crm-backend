import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { proceduresApi } from '@/api/procedures.api';
import { useProcedures, useNotifications } from '@/lib/store';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Plus, 
  Edit, 
  Trash2, 
  Package,
  DollarSign,
  ToggleLeft,
  ToggleRight,
  Save
} from 'lucide-react';
import type { Procedure, CreateProcedureDto } from '@/types';

export default function ProceduresManagement() {
  const navigate = useNavigate();
  const { procedures, setProcedures, addProcedure, updateProcedure, removeProcedure } = useProcedures();
  const addNotification = useNotifications((state) => state.addNotification);
  
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<Procedure | null>(null);
  const [formData, setFormData] = useState<CreateProcedureDto>({
    name: '',
    price: 0,
    currency: '₸',
    keywords: [],
    active: true,
  });
  const [keywordInput, setKeywordInput] = useState('');

  useEffect(() => {
    loadProcedures();
  }, []);

  const loadProcedures = async () => {
    try {
      setLoading(true);
      const response = await proceduresApi.getAll();
      setProcedures(response.data);
    } catch (error) {
      console.error('Failed to load procedures:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка загрузки',
        message: 'Не удалось загрузить процедуры',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (procedure?: Procedure) => {
    if (procedure) {
      setEditingProcedure(procedure);
      setFormData({
        name: procedure.name,
        price: procedure.price,
        currency: procedure.currency,
        keywords: procedure.keywords || [],
        active: procedure.active,
      });
    } else {
      setEditingProcedure(null);
      setFormData({
        name: '',
        price: 0,
        currency: '₸',
        keywords: [],
        active: true,
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingProcedure) {
        const response = await proceduresApi.update(editingProcedure.id, formData);
        updateProcedure(editingProcedure.id, response.data);
        addNotification({
          type: 'success',
          title: 'Обновлено',
          message: 'Процедура успешно обновлена',
        });
      } else {
        const response = await proceduresApi.create(formData);
        addProcedure(response.data);
        addNotification({
          type: 'success',
          title: 'Создано',
          message: 'Процедура успешно создана',
        });
      }
      setModalOpen(false);
      loadProcedures();
    } catch (error) {
      console.error('Failed to save procedure:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка сохранения',
        message: 'Не удалось сохранить процедуру',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить процедуру?')) return;

    try {
      await proceduresApi.delete(id);
      removeProcedure(id);
      addNotification({
        type: 'success',
        title: 'Удалено',
        message: 'Процедура успешно удалена',
      });
    } catch (error) {
      console.error('Failed to delete procedure:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка удаления',
        message: 'Не удалось удалить процедуру',
      });
    }
  };

  const handleToggleActive = async (procedure: Procedure) => {
    try {
      const response = await proceduresApi.toggleActive(procedure.id);
      updateProcedure(procedure.id, response.data);
      addNotification({
        type: 'success',
        title: 'Обновлено',
        message: `Процедура ${response.data.active ? 'активирована' : 'деактивирована'}`,
      });
    } catch (error) {
      console.error('Failed to toggle procedure:', error);
      addNotification({
        type: 'error',
        title: 'Ошибка',
        message: 'Не удалось изменить статус',
      });
    }
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim()) {
      setFormData({
        ...formData,
        keywords: [...(formData.keywords || []), keywordInput.trim()],
      });
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (index: number) => {
    setFormData({
      ...formData,
      keywords: formData.keywords?.filter((_, i) => i !== index),
    });
  };

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
              <h1 className="text-3xl font-bold">Процедуры</h1>
              <p className="text-gray-600">Управление процедурами и ценами</p>
            </div>
          </div>
          <Button onClick={() => handleOpenModal()}>
            <Plus className="w-4 h-4 mr-2" />
            Добавить процедуру
          </Button>
        </div>

        {/* Procedures Grid */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Загрузка...</div>
        ) : procedures.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-gray-500">
              Процедур пока нет
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {procedures.map((procedure) => (
              <Card key={procedure.id} className={!procedure.active ? 'opacity-60' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-purple-600" />
                      <CardTitle className="text-lg">{procedure.name}</CardTitle>
                    </div>
                    <Badge variant={procedure.active ? 'default' : 'secondary'}>
                      {procedure.active ? 'Активна' : 'Неактивна'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Price */}
                  <div className="flex items-center gap-2 text-lg font-bold text-green-600">
                    <DollarSign className="w-5 h-5" />
                    {procedure.price.toLocaleString()} {procedure.currency}
                  </div>

                  {/* Keywords */}
                  {procedure.keywords && procedure.keywords.length > 0 && (
                    <div>
                      <div className="text-sm text-gray-600 mb-2">Ключевые слова:</div>
                      <div className="flex flex-wrap gap-1">
                        {procedure.keywords.map((keyword, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  {procedure._count && (
                    <div className="text-sm text-gray-600">
                      Лидов: <span className="font-semibold">{procedure._count.leads}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleToggleActive(procedure)}
                    >
                      {procedure.active ? (
                        <ToggleRight className="w-4 h-4 mr-1" />
                      ) : (
                        <ToggleLeft className="w-4 h-4 mr-1" />
                      )}
                      {procedure.active ? 'Деактивировать' : 'Активировать'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenModal(procedure)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(procedure.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingProcedure ? 'Редактировать процедуру' : 'Новая процедура'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-sm font-medium mb-2 block">Название</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Например: RF-лифтинг"
                />
              </div>

              {/* Price & Currency */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Цена</label>
                  <Input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Валюта</label>
                  <Input
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    placeholder="₸"
                  />
                </div>
              </div>

              {/* Keywords */}
              <div>
                <label className="text-sm font-medium mb-2 block">Ключевые слова</label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
                    placeholder="Добавить ключевое слово"
                  />
                  <Button type="button" onClick={handleAddKeyword}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {formData.keywords?.map((keyword, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="cursor-pointer hover:bg-red-100"
                      onClick={() => handleRemoveKeyword(i)}
                    >
                      {keyword} ×
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Отмена
              </Button>
              <Button onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" />
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
