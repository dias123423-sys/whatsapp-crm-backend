import { ReactNode } from 'react';
import { clsx } from 'clsx';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'emerald';
  subtitle?: string;
  loading?: boolean;
  onClick?: () => void;
  active?: boolean;
}

const colorMap = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  green: 'bg-green-50 text-green-600 border-green-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
  orange: 'bg-orange-50 text-orange-600 border-orange-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
};

const iconBg = {
  blue: 'bg-blue-100',
  green: 'bg-green-100',
  purple: 'bg-purple-100',
  orange: 'bg-orange-100',
  emerald: 'bg-emerald-100',
};

export function StatsCard({
  title,
  value,
  icon,
  color = 'blue',
  subtitle,
  loading = false,
  onClick,
  active = false,
}: StatsCardProps) {
  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={clsx(
        'card border text-left w-full',
        colorMap[color],
        onClick && 'cursor-pointer hover:shadow-md transition-shadow',
        active && 'ring-2 ring-offset-1 ring-current'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium opacity-80">{title}</p>
        <div className={clsx('p-2 rounded-lg', iconBg[color])}>{icon}</div>
      </div>
      {loading ? (
        <div className="h-8 bg-current opacity-10 rounded animate-pulse w-16" />
      ) : (
        <p className="text-3xl font-bold">{value}</p>
      )}
      {subtitle && <p className="text-xs mt-1 opacity-60">{subtitle}</p>}
    </Comp>
  );
}
