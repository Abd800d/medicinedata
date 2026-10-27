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
  isPharmacist: boolean;
};

const USER_KEY = 'mda.user';

const getRememberedUser = (): User | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User | null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const setRememberedUser = (u: User | null) => {
  if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
  else localStorage.removeItem(USER_KEY);
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getRememberedUser());
  const [loading, setLoading] = useState(true);

  const persistUser = useCallback((nextUser: User | null) => {
    setUser(nextUser);
    setRememberedUser(nextUser);
  }, []);

  const refresh = useCallback(async () => {
    const token = getToken();
    const remembered = getRememberedUser();
    if (!token) {
      persistUser(remembered);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<User>('/api/auth/me');
      persistUser(me);
    } catch {
      setToken(null);
      setRememberedUser(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [persistUser]);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
    setToken(res.token);
    persistUser(res.user);
    return res.user;
  };
  const register = async (data: { name: string; email: string; password: string; phone?: string; city?: string }) => {
    const res = await api.post<{ token: string; user: User }>('/api/auth/register', data);
    setToken(res.token);
    persistUser(res.user);
    return res.user;
  };
  const loginWithGoogle = async (credential: string) => {
    const res = await api.post<{ token: string; user: User }>('/api/auth/google', { credential });
    setToken(res.token);
    persistUser(res.user);
    return res.user;
  };
  const logout = () => {
    setToken(null);
    setRememberedUser(null);
    setUser(null);
    /* the offline queue belongs to the account that is leaving */
    try { window.dispatchEvent(new Event('mda:logout')); } catch { /* ignore */ }
  };
  const patchUser = (u: Partial<User>) => setUser((prev) => {
    const next = prev ? { ...prev, ...u } : prev;
    if (next) setRememberedUser(next);
    return next;
  });

  const value = useMemo<AuthCtx>(() => ({
    user,
    loading,
    login,
    register,
    loginWithGoogle,
    logout,
    patchUser,
    refresh,
    isAdmin: user?.role === 'admin',
    isPharmacist: user?.role === 'pharmacist' || user?.role === 'admin',
  }), [user, loading, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
