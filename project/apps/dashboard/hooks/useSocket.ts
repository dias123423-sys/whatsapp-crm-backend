'use client';

import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { Appointment, WhatsAppStatus } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export function useSocket() {
  const queryClient = useQueryClient();
  const socketRef = useRef(getSocket());

  useEffect(() => {
    const socket = socketRef.current;

    // New appointment arrived
    socket.on('appointment:new', (appointment: Appointment) => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });

      toast.success(
        `📋 Новая запись: ${appointment.clientName} в ${appointment.appointmentTime}`,
        { duration: 5000 }
      );
    });

    // Appointment updated
    socket.on('appointment:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    });

    // Appointment deleted
    socket.on('appointment:deleted', () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    });

    // Stats update
    socket.on('stats:update', () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    });

    return () => {
      socket.off('appointment:new');
      socket.off('appointment:updated');
      socket.off('appointment:deleted');
      socket.off('stats:update');
    };
  }, [queryClient]);

  return socketRef.current;
}

export function useWhatsAppSocket(
  onStatusChange: (status: WhatsAppStatus) => void,
  onQRCode: (accountId: string, qr: string) => void
) {
  useEffect(() => {
    const socket = getSocket();

    socket.on('whatsapp:status', (data: WhatsAppStatus) => {
      console.log('[Socket.IO] Received whatsapp:status:', data);
      onStatusChange(data);
    });

    socket.on('whatsapp:qr', ({ accountId, qr }: { accountId: string; qr: string }) => {
      console.log('[Socket.IO] Received whatsapp:qr:', accountId);
      onQRCode(accountId, qr);
    });

    return () => {
      socket.off('whatsapp:status');
      socket.off('whatsapp:qr');
    };
  }, [onStatusChange, onQRCode]);
}
