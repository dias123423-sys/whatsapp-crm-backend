'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AppointmentStats, CreatedBy } from '@/types';
import { StatsCard } from './ui/StatsCard';
import { Calendar, CalendarDays, CalendarRange, Bot, User, Hash } from 'lucide-react';

interface Props {
  onFilterByCreatedBy?: (createdBy: CreatedBy | '') => void;
  activeCreatedBy?: CreatedBy | '';
}

export function StatsOverview({ onFilterByCreatedBy, activeCreatedBy }: Props) {
  const { data: stats, isLoading } = useQuery<AppointmentStats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await api.get('/api/appointments/stats');
      return res.data.data;
    },
    // Socket.IO invalidates 'stats' on every appointment:new / appointment:deleted
    // event (see useSocket.ts), so a long stale time is fine here.
    // We keep a 5-minute background refetch only as a safety net.
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <StatsCard
        title="Сегодня"
        value={stats?.today ?? 0}
        icon={<Calendar size={18} />}
        color="blue"
        loading={isLoading}
      />
      <StatsCard
        title="На этой неделе"
        value={stats?.thisWeek ?? 0}
        icon={<CalendarDays size={18} />}
        color="purple"
        loading={isLoading}
      />
      <StatsCard
        title="В этом месяце"
        value={stats?.thisMonth ?? 0}
        icon={<CalendarRange size={18} />}
        color="orange"
        loading={isLoading}
      />
      <StatsCard
        title="BOT записей"
        value={stats?.botCount ?? 0}
        icon={<Bot size={18} />}
        color="emerald"
        loading={isLoading}
        onClick={
          onFilterByCreatedBy
            ? () => onFilterByCreatedBy(activeCreatedBy === 'BOT' ? '' : 'BOT')
            : undefined
        }
        active={activeCreatedBy === 'BOT'}
      />
      <StatsCard
        title="OPERATOR записей"
        value={stats?.operatorCount ?? 0}
        icon={<User size={18} />}
        color="green"
        loading={isLoading}
        onClick={
          onFilterByCreatedBy
            ? () => onFilterByCreatedBy(activeCreatedBy === 'OPERATOR' ? '' : 'OPERATOR')
            : undefined
        }
        active={activeCreatedBy === 'OPERATOR'}
      />
      <StatsCard
        title="Всего"
        value={stats?.totalCount ?? 0}
        icon={<Hash size={18} />}
        color="blue"
        loading={isLoading}
        onClick={onFilterByCreatedBy ? () => onFilterByCreatedBy('') : undefined}
        active={!activeCreatedBy}
      />
    </div>
  );
}
