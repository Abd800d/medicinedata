import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

export type User = {
  id: number; name: string; email: string; role: 'user' | 'pharmacist' | 'editor' | 'admin';
  provider: string; avatar?: string | null; phone?: string | null; city?: string | null;
  country?: string | null; created_at?: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; password: string; phone?: string; city?: string }) => Promise<User>;
  loginWithGoogle: (credential: string) => Promise<User>;
  logout: () => void;
  patchUser: (u: Partial<User>) => void;
  refresh: () => Promise<void>;
  isAdmin: boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      const me = await api.get<User>('/api/auth/me');
      setUser(me);
    } catch {
      setToken(null);
      setUser(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
    setToken(res.token); setUser(res.user); return res.user;
  };
  const register = async (data: { name: string; email: string; password: string; phone?: string; city?: string }) => {
    const res = await api.post<{ token: string; user: User }>('/api/auth/register', data);
    setToken(res.token); setUser(res.user); return res.user;
  };
  const loginWithGoogle = async (credential: string) => {
    const res = await api.post<{ token: string; user: User }>('/api/auth/google', { credential });
    setToken(res.token); setUser(res.user); return res.user;
  };
  const logout = () => { setToken(null); setUser(null); };
  const patchUser = (u: Partial<User>) => setUser((prev) => (prev ? { ...prev, ...u } : prev));

  const value = useMemo<AuthCtx>(() => ({
    user, loading, login, register, loginWithGoogle, logout, patchUser, refresh, isAdmin: user?.role === 'admin',
    isPharmacist: user?.role === 'pharmacist' || user?.role === 'admin',
  }), [user, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
