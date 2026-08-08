import { create } from 'zustand';
import type { User, Lead, WhatsAppAccount, Operator, Procedure } from '@/types';

// ============================================
// AUTH STORE
// ============================================

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  setAuth: (user, token) => {
    localStorage.setItem('token', token);
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null });
    window.location.href = '/login';
  },
}));

// ============================================
// LEADS STORE
// ============================================

interface LeadsState {
  leads: Lead[];
  selectedLeads: Set<string>;
  setLeads: (leads: Lead[]) => void;
  addLead: (lead: Lead) => void;
  updateLead: (id: string, data: Partial<Lead>) => void;
  removeLead: (id: string) => void;
  toggleSelectLead: (id: string) => void;
  selectAllLeads: () => void;
  clearSelection: () => void;
}

export const useLeads = create<LeadsState>((set) => ({
  leads: [],
  selectedLeads: new Set(),
  setLeads: (leads) => set({ leads: Array.isArray(leads) ? leads : [] }),
  addLead: (lead) => set((state) => ({ leads: [lead, ...state.leads] })),
  updateLead: (id, data) =>
    set((state) => ({
      leads: state.leads.map((lead) => (lead.id === id ? { ...lead, ...data } : lead)),
    })),
  removeLead: (id) =>
    set((state) => ({
      leads: state.leads.filter((lead) => lead.id !== id),
      selectedLeads: new Set([...state.selectedLeads].filter((leadId) => leadId !== id)),
    })),
  toggleSelectLead: (id) =>
    set((state) => {
      const newSelected = new Set(state.selectedLeads);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return { selectedLeads: newSelected };
    }),
  selectAllLeads: () =>
    set((state) => ({
      selectedLeads: new Set(state.leads.map((lead) => lead.id)),
    })),
  clearSelection: () => set({ selectedLeads: new Set() }),
}));

// ============================================
// WHATSAPP STORE
// ============================================

interface WhatsAppState {
  accounts: WhatsAppAccount[];
  setAccounts: (accounts: WhatsAppAccount[]) => void;
  updateAccount: (id: string, data: Partial<WhatsAppAccount>) => void;
  getAccountById: (id: string) => WhatsAppAccount | undefined;
}

export const useWhatsApp = create<WhatsAppState>((set, get) => ({
  accounts: [],
  setAccounts: (accounts) => set({ accounts }),
  updateAccount: (id, data) =>
    set((state) => ({
      accounts: state.accounts.map((acc) => (acc.id === id ? { ...acc, ...data } : acc)),
    })),
  getAccountById: (id) => get().accounts.find((acc) => acc.id === id),
}));

// ============================================
// OPERATORS STORE
// ============================================

interface OperatorsState {
  operators: Operator[];
  setOperators: (operators: Operator[]) => void;
  updateOperator: (id: string, data: Partial<Operator>) => void;
}

export const useOperators = create<OperatorsState>((set) => ({
  operators: [],
  setOperators: (operators) => set({ operators: Array.isArray(operators) ? operators : [] }),
  updateOperator: (id, data) =>
    set((state) => ({
      operators: state.operators.map((op) => (op.id === id ? { ...op, ...data } : op)),
    })),
}));

// ============================================
// PROCEDURES STORE
// ============================================

interface ProceduresState {
  procedures: Procedure[];
  setProcedures: (procedures: Procedure[]) => void;
  addProcedure: (procedure: Procedure) => void;
  updateProcedure: (id: string, data: Partial<Procedure>) => void;
  removeProcedure: (id: string) => void;
}

export const useProcedures = create<ProceduresState>((set) => ({
  procedures: [],
  setProcedures: (procedures) => set({ procedures }),
  addProcedure: (procedure) => set((state) => ({ procedures: [...state.procedures, procedure] })),
  updateProcedure: (id, data) =>
    set((state) => ({
      procedures: state.procedures.map((proc) => (proc.id === id ? { ...proc, ...data } : proc)),
    })),
  removeProcedure: (id) =>
    set((state) => ({
      procedures: state.procedures.filter((proc) => proc.id !== id),
    })),
}));

// ============================================
// NOTIFICATIONS STORE
// ============================================

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

interface NotificationsState {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

export const useNotifications = create<NotificationsState>((set) => ({
  notifications: [],
  addNotification: (notification) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification = { ...notification, id };
    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));
    
    // Auto-remove after duration
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    }, notification.duration || 5000);
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
