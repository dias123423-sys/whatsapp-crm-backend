import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'OPERATOR';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  companyId: string;
  operatorId?: string;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  isAdmin: () => boolean;
  isOperator: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user) => set({ user }),
      isAdmin: () => {
        const role = get().user?.role;
        return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER';
      },
      isOperator: () => get().user?.role === 'OPERATOR',
    }),
    { name: 'crm-auth' },
  ),
);
