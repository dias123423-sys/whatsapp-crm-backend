import { ReactNode } from 'react';
import { clsx } from 'clsx';

interface Props {
  title: string;
  value: number | string;
  icon: ReactNode;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'yellow';
  subtitle?: string;
  loading?: boolean;
  trend?: number;
}

const colorMap = {
  blue:   'bg-blue-50   text-blue-600   border-blue-100',
  green:  'bg-green-50  text-green-600  border-green-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
  orange: 'bg-orange-50 text-orange-600 border-orange-100',
  red:    'bg-red-50    text-red-600    border-red-100',
  yellow: 'bg-yellow-50 text-yellow-600 border-yellow-100',
};

export function StatsCard({ title, value, icon, color = 'blue', subtitle, loading, trend }: Props) {
  return (
    <div className={clsx('card border', colorMap[color])}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium opacity-80">{title}</p>
        <div className="p-2 rounded-lg bg-white/60">{icon}</div>
      </div>
      {loading ? (
        <div className="h-8 bg-current opacity-10 rounded animate-pulse w-16" />
      ) : (
        <p className="text-3xl font-bold">{value}</p>
      )}
      {subtitle && <p className="text-xs mt-1 opacity-60">{subtitle}</p>}
      {trend !== undefined && (
        <p className={clsx('text-xs mt-1 font-medium', trend >= 0 ? 'text-green-600' : 'text-red-500')}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs вчера
        </p>
      )}
    </div>
  );
}
