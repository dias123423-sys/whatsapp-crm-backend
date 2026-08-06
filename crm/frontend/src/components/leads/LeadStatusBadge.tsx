import { clsx } from 'clsx';

const LABELS: Record<string, string> = {
  NEW:       '🟢 Новый',
  CALLING:   '📞 Звонок',
  BOOKED:    '✅ Записан',
  FOLLOW_UP: '🔔 Перезвон',
  NO_ANSWER: '❌ Нет ответа',
  CLOSED:    '⛔ Закрыт',
  DUPLICATE: '🔁 Дубликат',
};

export function LeadStatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx('badge', `status-${status}`)}>
      {LABELS[status] ?? status}
    </span>
  );
}
