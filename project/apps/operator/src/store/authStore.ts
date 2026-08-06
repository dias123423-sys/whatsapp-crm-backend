import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: JSON.parse(localStorage.getItem('op_user') || 'null'),
  token: localStorage.getItem('op_token'),

  setAuth: (user, token) => {
    localStorage.setItem('op_token', token);
    localStorage.setItem('op_user', JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('op_token');
    localStorage.removeItem('op_user');
    set({ user: null, token: null });
  },

  isAuthenticated: () => !!get().token && !!get().user,
}));
