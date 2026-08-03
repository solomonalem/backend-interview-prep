import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { InterviewerUser } from '@assessiq/types';
import { authApi } from '../api/auth.api';

interface AuthState {
  user: InterviewerUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<InterviewerUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on load by asking the server who we are.
  useEffect(() => {
    authApi
      .me()
      .then((me) => setUser({ id: me.id, email: me.email, name: me.name, company: me.company }))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { user } = await authApi.login(email, password);
    setUser(user);
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
