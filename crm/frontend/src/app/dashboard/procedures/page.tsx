'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function ProceduresPage() {
  const { data: procedures = [], isLoading } = useQuery({
    queryKey: ['procedures'],
    queryFn: async () => { const r = await api.get('/api/procedures'); return r.data.data; },
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Процедуры</h1>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Название','Slug','Ключевые слова','Лидов'].map(h => (
                <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? Array.from({length:5}).map((_,i) => (
              <tr key={i}><td colSpan={4} className="py-3 px-4"><div className="h-4 bg-gray-100 rounded animate-pulse"/></td></tr>
            )) : procedures.map((p: { id: string; name: string; slug: string; color: string; keywords: string[]; _count?: { leads: number } }) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 px-4">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                    <strong>{p.name}</strong>
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-xs text-gray-500">{p.slug}</td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {p.keywords.map((k: string) => (
                      <span key={k} className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded">{k}</span>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-4 font-semibold">{p._count?.leads ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
