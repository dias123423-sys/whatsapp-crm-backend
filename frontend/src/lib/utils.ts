import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return format(new Date(date), 'dd MMM yyyy, HH:mm', { locale: ru });
}

export function formatPhone(phone: string) {
  return phone.replace(/(\d{1})(\d{3})(\d{3})(\d{2})(\d{2})/, '+$1 ($2) $3-$4-$5');
}

export const leadStatusColors = {
  NEW: 'bg-blue-100 text-blue-800',
  ASSIGNED: 'bg-purple-100 text-purple-800',
  CALLING: 'bg-yellow-100 text-yellow-800',
  BOOKED: 'bg-green-100 text-green-800',
  FOLLOW_UP: 'bg-orange-100 text-orange-800',
  NO_ANSWER: 'bg-gray-100 text-gray-800',
  CLOSED: 'bg-red-100 text-red-800',
};

export const leadStatusLabels = {
  NEW: 'Новый',
  ASSIGNED: 'Назначен',
  CALLING: 'Звоним',
  BOOKED: 'Записан',
  FOLLOW_UP: 'Перезвонить',
  NO_ANSWER: 'Не отвечает',
  CLOSED: 'Закрыт',
};
