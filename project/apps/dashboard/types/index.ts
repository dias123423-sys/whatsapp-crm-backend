export type CreatedBy = 'BOT' | 'OPERATOR';
export type WhatsAppAccount = 'WA1' | 'WA2' | 'WA3' | 'WA4';

export interface Appointment {
  id: string;
  clientName: string;
  phone: string;
  appointmentDate: string;
  appointmentTime: string;
  whatsappAccount: WhatsAppAccount;
  createdBy: CreatedBy;
  operatorName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  botCount: number;
  operatorCount: number;
  totalCount: number;
  byAccount: Record<WhatsAppAccount, number>;
}

export interface WhatsAppStatus {
  accountId: WhatsAppAccount;
  isConnected: boolean;
  phoneNumber?: string;
  lastSeen?: string;
  hasQR?: boolean;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface AppointmentFilters {
  startDate?: string;
  endDate?: string;
  whatsappAccount?: WhatsAppAccount | '';
  createdBy?: CreatedBy | '';
  search?: string;
  page?: number;
  limit?: number;
}
