import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, clearSession, getStoredUser, getToken, saveSession } from './api';
import type { Role, User } from './types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  can: (roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => (getToken() ? getStoredUser() : null));
  const [token, setToken] = useState<string | null>(() => getToken());

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('laras:unauthorized', onUnauthorized);
    return () => window.removeEventListener('laras:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
    saveSession(response.token, response.user);
    setUser(response.user);
    setToken(response.token);
    return response.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
    window.location.href = '/login';
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      login,
      logout,
      can: (roles: Role[]) => Boolean(user && roles.includes(user.role)),
    }),
    [user, token, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
