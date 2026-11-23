import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setAuthToken } from './api';
import type { User } from './types';

const TOKEN_KEY = 'laras.session.token';
const USER_KEY = 'laras.session.user';

interface AuthValue {
  token: string | null;
  user: User | null;
  booting: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);
        if (!storedToken || !storedUser) return;
        setAuthToken(storedToken);
        const parsed = JSON.parse(storedUser) as User;
        const me = await api.get<{ user: User }>('/api/auth/me');
        if (!active) return;
        setToken(storedToken);
        setUser(me.user ?? parsed);
      } catch {
        setAuthToken(null);
        await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]);
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      token,
      user,
      booting,
      async login(email, password) {
        const result = await api.post<{ token: string; user: User }>('/api/auth/login', {
          email: email.trim(),
          password,
        });
        setAuthToken(result.token);
        setToken(result.token);
        setUser(result.user);
        await Promise.all([
          SecureStore.setItemAsync(TOKEN_KEY, result.token),
          SecureStore.setItemAsync(USER_KEY, JSON.stringify(result.user)),
        ]);
      },
      async logout() {
        setAuthToken(null);
        setToken(null);
        setUser(null);
        await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]);
      },
    }),
    [token, user, booting],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
