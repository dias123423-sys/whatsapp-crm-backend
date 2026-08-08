// ============================================
// USER & AUTH
// ============================================

export type UserRole = 'ADMIN' | 'OPERATOR';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  operator?: Operator;
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

// ============================================
// WHATSAPP ACCOUNTS
// ============================================

export type WhatsAppStatus = 
  | 'CONNECTED' 
  | 'DISCONNECTED' 
  | 'CONNECTING' 
  | 'QR_REQUIRED' 
  | 'ERROR';

export interface WhatsAppAccount {
  id: string;
  name: string; // "WhatsApp 1", "WhatsApp 2", etc.
  phone?: string;
  instanceName: string; // Evolution API instance name
  status: WhatsAppStatus;
  qrCode?: string;
  lastConnectedAt?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    leads: number;
  };
}

export interface WhatsAppQRResponse {
  qrCode: string;
  instanceName: string;
}

// ============================================
// PROCEDURES
// ============================================

export interface Procedure {
  id: string;
  name: string;
  price: number;
  currency: string;
  keywords?: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    leads: number;
  };
}

export interface CreateProcedureDto {
  name: string;
  price: number;
  currency?: string;
  keywords?: string[];
  active?: boolean;
}

// ============================================
// CLIENTS
// ============================================

export interface Client {
  id: string;
  phone: string;
  name?: string;
  whatsappName?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    leads: number;
  };
  leads?: Lead[];
  lastLead?: Lead;
}

// ============================================
// LEADS
// ============================================

export type LeadStatus = 
  | 'NEW' 
  | 'ASSIGNED'
  | 'CALLING' 
  | 'BOOKED' 
  | 'FOLLOW_UP' 
  | 'NO_ANSWER' 
  | 'CLOSED';

export type LeadSource = 'INSTAGRAM' | 'FACEBOOK' | 'WHATSAPP' | 'DIRECT' | 'OTHER';

export interface Lead {
  id: string;
  clientId: string;
  client: Client;
  
  // WhatsApp info
  whatsappAccountId: string;
  whatsappAccount?: WhatsAppAccount;
  originalMessage: string;
  
  // Parsed data
  phone: string;
  whatsappName?: string;
  procedures?: Procedure[];
  price?: number;
  currency?: string;
  
  // Assignment
  operatorId?: string;
  operator?: Operator;
  
  // Status & tracking
  status: LeadStatus;
  source?: LeadSource;
  campaign?: string;
  notes?: string;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  assignedAt?: string;
  completedAt?: string;
}

export interface LeadFilters {
  status?: LeadStatus;
  operatorId?: string;
  whatsappAccountId?: string;
  procedureId?: string;
  source?: LeadSource;
  campaign?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedLeads {
  data: Lead[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AssignLeadDto {
  operatorId: string;
}

export interface UpdateLeadStatusDto {
  status: LeadStatus;
  notes?: string;
}

// ============================================
// OPERATORS
// ============================================

export interface Operator {
  id: string;
  userId: string;
  user?: User;
  
  // Stats
  currentLeads: number;
  totalLeads: number;
  totalCalls: number;
  totalBooked: number;
  
  active: boolean;
  createdAt: string;
  updatedAt: string;
  
  _count?: {
    leads: number;
  };
  
  // Computed
  conversionRate?: number;
}

// ============================================
// DASHBOARD
// ============================================

export interface DashboardStats {
  totalLeads: number;
  todayLeads: number;
  newLeads: number;
  inProgress: number;
  bookedLeads: number;
  followUpLeads: number;
  noAnswerLeads: number;
  closedLeads: number;
  
  whatsappStats: {
    accountId: string;
    accountName: string;
    status: WhatsAppStatus;
    leadsCount: number;
  }[];
  
  procedureStats: {
    procedureId: string;
    procedureName: string;
    count: number;
    totalPrice: number;
  }[];
  
  operatorStats: {
    operatorId: string;
    operatorName: string;
    leadsCount: number;
    bookedCount: number;
    conversionRate: number;
  }[];
}

// ============================================
// REPORTS
// ============================================

export type ReportPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'night' | 'day';

export interface ReportFilters {
  period: ReportPeriod;
  dateFrom?: string;
  dateTo?: string;
  whatsappAccountId?: string;
  operatorId?: string;
  procedureId?: string;
}

export interface Report {
  period: string;
  dateFrom: string;
  dateTo: string;
  
  totalLeads: number;
  newLeads: number;
  bookedLeads: number;
  followUpLeads: number;
  noAnswerLeads: number;
  closedLeads: number;
  
  totalRevenue: number;
  averagePrice: number;
  conversionRate: number;
  
  byWhatsApp: {
    accountId: string;
    accountName: string;
    leadsCount: number;
    bookedCount: number;
  }[];
  
  byProcedure: {
    procedureId: string;
    procedureName: string;
    count: number;
    bookedCount: number;
    totalPrice: number;
  }[];
  
  byOperator: {
    operatorId: string;
    operatorName: string;
    leadsCount: number;
    bookedCount: number;
    conversionRate: number;
  }[];
}

// ============================================
// WEBSOCKET EVENTS
// ============================================

export type WebSocketEvent = 
  | 'lead.created'
  | 'lead.updated'
  | 'lead.assigned'
  | 'lead.status_changed'
  | 'whatsapp.connected'
  | 'whatsapp.disconnected'
  | 'whatsapp.qr_updated'
  | 'whatsapp.error'
  | 'operator.updated';

export interface WebSocketMessage<T = any> {
  event: WebSocketEvent;
  data: T;
}

// ============================================
// AUDIT LOG
// ============================================

export interface AuditLog {
  id: string;
  userId: string;
  user?: User;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

// ============================================
// API RESPONSES
// ============================================

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

export interface ApiResponse<T = any> {
  data: T;
  message?: string;
}

// ============================================
// FORM TYPES
// ============================================

export interface LeadFormData {
  phone: string;
  name?: string;
  procedureIds?: string[];
  price?: number;
  notes?: string;
  source?: LeadSource;
  campaign?: string;
}

export interface OperatorFormData {
  userId: string;
  active: boolean;
}

// ============================================
// UI HELPERS
// ============================================

export const leadStatusLabels: Record<LeadStatus, string> = {
  NEW: 'Новый',
  ASSIGNED: 'Назначен',
  CALLING: 'Звоню',
  BOOKED: 'Записан',
  FOLLOW_UP: 'Перезвонить',
  NO_ANSWER: 'Не ответил',
  CLOSED: 'Закрыт',
};

export const leadStatusColors: Record<LeadStatus, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  ASSIGNED: 'bg-purple-100 text-purple-800',
  CALLING: 'bg-yellow-100 text-yellow-800',
  BOOKED: 'bg-green-100 text-green-800',
  FOLLOW_UP: 'bg-orange-100 text-orange-800',
  NO_ANSWER: 'bg-gray-100 text-gray-800',
  CLOSED: 'bg-red-100 text-red-800',
};

export const whatsappStatusLabels: Record<WhatsAppStatus, string> = {
  CONNECTED: 'Подключен',
  DISCONNECTED: 'Не подключен',
  CONNECTING: 'Подключение...',
  QR_REQUIRED: 'Требуется QR',
  ERROR: 'Ошибка',
};

export const whatsappStatusColors: Record<WhatsAppStatus, string> = {
  CONNECTED: 'bg-green-500',
  DISCONNECTED: 'bg-red-500',
  CONNECTING: 'bg-yellow-500',
  QR_REQUIRED: 'bg-orange-500',
  ERROR: 'bg-red-600',
};
