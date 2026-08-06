const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  NEW: { label: 'Новый', className: 'bg-blue-100 text-blue-700' },
  CALLING: { label: 'Звонок', className: 'bg-yellow-100 text-yellow-700' },
  BOOKED: { label: 'Записан', className: 'bg-green-100 text-green-700' },
  FOLLOW_UP: { label: 'Перезвонить', className: 'bg-purple-100 text-purple-700' },
  NO_ANSWER: { label: 'Не отвечает', className: 'bg-gray-100 text-gray-600' },
  CLOSED: { label: 'Закрыт', className: 'bg-red-100 text-red-700' },
  ONLINE: { label: 'Online', className: 'bg-green-100 text-green-700' },
  OFFLINE: { label: 'Offline', className: 'bg-gray-100 text-gray-500' },
  CONNECTING: { label: 'Подключение', className: 'bg-yellow-100 text-yellow-700' },
  ACTIVE: { label: 'Активен', className: 'bg-green-100 text-green-700' },
  INACTIVE: { label: 'Неактивен', className: 'bg-gray-100 text-gray-500' },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, className: 'bg-gray-100 text-gray-600' };
  return <span className={`badge ${cfg.className}`}>{cfg.label}</span>;
}
