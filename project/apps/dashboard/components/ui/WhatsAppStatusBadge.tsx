'use client';

import { clsx } from 'clsx';

interface Props {
  accountId: string;
  isConnected: boolean;
  phoneNumber?: string;
}

export function WhatsAppStatusBadge({ accountId, isConnected, phoneNumber }: Props) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium',
        isConnected
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-gray-50 border-gray-200 text-gray-500'
      )}
    >
      <span
        className={clsx(
          'status-dot',
          isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
        )}
      />
      <span>{accountId}</span>
      {phoneNumber && (
        <span className="text-xs opacity-70">{phoneNumber}</span>
      )}
    </div>
  );
}
