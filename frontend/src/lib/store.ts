import { create } from 'zustand';
import { User, Lead } from '../types';

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

interface LeadState {
  leads: Lead[];
  selectedLead: Lead | null;
  setLeads: (leads: Lead[]) => void;
  setSelectedLead: (lead: Lead | null) => void;
  updateLead: (id: string, data: Partial<Lead>) => void;
}

export const useLeads = create<LeadState>((set) => ({
  leads: [],
  selectedLead: null,
  setLeads: (leads) => set({ leads: Array.isArray(leads) ? leads : [] }),
  setSelectedLead: (lead) => set({ selectedLead: lead }),
  updateLead: (id, data) =>
    set((state) => ({
      leads: state.leads.map((lead) =>
        lead.id === id ? { ...lead, ...data } : lead
      ),
    })),
}));
