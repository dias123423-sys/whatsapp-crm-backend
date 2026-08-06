'use client';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/auth.store';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const router   = useRouter();
  const qc       = useQueryClient();

  // Auth guard
  useEffect(() => {
    if (!user) router.push('/auth/login');
  }, [user, router]);

  // Global Socket.IO listeners
  useEffect(() => {
    const socket = getSocket();

    socket.on('lead:new', (lead: { clientName?: string; procedure?: { name: string } }) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success(`🟢 Новый лид: ${lead.procedure?.name ?? 'неизвестно'}`, { duration: 5000 });
    });

    socket.on('lead:status_changed', () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
    });

    socket.on('lead:duplicate', () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast('🔁 Дубликат лида', { icon: '⚠️' });
    });

    return () => {
      socket.off('lead:new');
      socket.off('lead:status_changed');
      socket.off('lead:duplicate');
    };
  }, [qc]);

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
