export type LeadStatus = 'NEW' | 'CALLING' | 'BOOKED' | 'FOLLOW_UP' | 'NO_ANSWER' | 'CLOSED' | 'DUPLICATE';

export interface Client {
  id: string;
  phone: string;
  waName?: string;
  isVip: boolean;
}

export interface Procedure {
  id: string;
  name: string;
  slug: string;
  color: string;
}

export interface Campaign {
  id: string;
  name: string;
  source: string;
}

export interface OperatorUser {
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

export interface Operator {
  id: string;
  displayName: string;
  isOnline: boolean;
  isAvailable: boolean;
  user: OperatorUser;
}

export interface Lead {
  id: string;
  status: LeadStatus;
  firstMessage: string;
  waAccountId: string;
  createdAt: string;
  client: Client;
  procedure?: Procedure | null;
  campaign?: Campaign | null;
  operator?: { id: string; user: OperatorUser } | null;
  isDuplicate: boolean;
  confidence: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  total: number;
  byStatus: Array<{ status: LeadStatus; _count: { _all: number } }>;
  byProcedure: Array<{ procedureId: string; _count: { _all: number } }>;
  byOperator: Array<{ operatorId: string; _count: { _all: number } }>;
  conversion: number;
}
