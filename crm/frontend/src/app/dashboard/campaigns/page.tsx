'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Target } from 'lucide-react';

export default function CampaignsPage() {
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => { const r = await api.get('/api/campaigns'); return r.data.data; },
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Кампании</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? Array.from({length:3}).map((_,i) => <div key={i} className="card animate-pulse h-32"/>) :
        campaigns.map((c: { id: string; name: string; source: string; waAccountId: string; isActive: boolean; _count: { leads: number } }) => (
          <div key={c.id} className="card space-y-2">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-blue-600" />
              <span className="font-semibold">{c.name}</span>
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {c.isActive ? 'Активна' : 'Отключена'}
              </span>
            </div>
            <p className="text-xs text-gray-500">Источник: <strong>{c.source}</strong> · WA: <strong>{c.waAccountId}</strong></p>
            <p className="text-sm text-gray-700">Лидов: <strong>{c._count?.leads ?? 0}</strong></p>
          </div>
        ))}
      </div>
    </div>
  );
}
