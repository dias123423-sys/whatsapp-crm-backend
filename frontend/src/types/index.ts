export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR' | 'MANAGER';
  operator?: Operator;
}

export interface Operator {
  id: string;
  userId: string;
  currentLeads: number;
  totalLeads: number;
  totalCalls: number;
  totalBooked: number;
  active: boolean;
}

export interface Lead {
  id: string;
  clientId: string;
  operatorId?: string;
  procedureId?: string;
  message?: string;
  status: LeadStatus;
  source: string;
  priority: number;
  notes?: string;
  period?: 'DAY' | 'NIGHT';
  createdAt: string;
  updatedAt: string;
  client: Client;
  operator?: Operator;
  procedure?: Procedure;
}

export type LeadStatus = 'NEW' | 'ASSIGNED' | 'CALLING' | 'BOOKED' | 'FOLLOW_UP' | 'NO_ANSWER' | 'CLOSED';

export interface Client {
  id: string;
  phone: string;
  whatsappName?: string;
  name?: string;
  email?: string;
  notes?: string;
  createdAt: string;
}

export interface Procedure {
  id: string;
  name: string;
  nameKz?: string;
  price: number;
  keywords: string[];
  description?: string;
  active: boolean;
}

export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  bookedLeads: number;
  activeOperators: number;
  todayLeads: number;
  conversionRate: number;
}
