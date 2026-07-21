import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import apiClient, { authClient } from '@/api/client';
import { useAuthStore } from '@/store/useAuthStore';

const persistSession = (userData) => {
  if (!userData) {
    localStorage.removeItem('user');
    return;
  }

  const safeUser = {
    access_token: userData.access_token ?? null,
    email: userData.email ?? null,
    company_name: userData.company_name ?? null,
    company_id: userData.company_id ?? null,
  };

  localStorage.setItem('user', JSON.stringify(safeUser));
};

const AuthContext = createContext(null);

const isUsableToken = (token) => typeof token === 'string' && token.trim() !== '' && token !== '••••••••' && token.length > 20;

const decodeJwtExpiry = (token) => {
  if (!token) {
    return null;
  }

  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) {
      return null;
    }

    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = window.atob(normalized);
    const payload = JSON.parse(decoded);
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
};

const shouldRefreshSession = (token) => {
  const expiry = decodeJwtExpiry(token);
  return expiry !== null && expiry * 1000 - Date.now() <= 120000;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const syncUserFromStorage = async () => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      useAuthStore.getState().logout();
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      const authStore = useAuthStore.getState();
      const persistedToken = isUsableToken(authStore.accessToken)
        ? authStore.accessToken
        : isUsableToken(parsedUser?.access_token)
          ? parsedUser.access_token
          : null;

      if (!persistedToken) {
        throw new Error('missing token');
      }

      const inMemoryUser = {
        access_token: persistedToken,
        email: parsedUser?.email ?? authStore.email ?? null,
        company_name: parsedUser?.company_name ?? authStore.companyName ?? null,
        company_id: parsedUser?.company_id ?? authStore.companyId ?? null,
      };
      persistSession(inMemoryUser);
      setUser(inMemoryUser);
      authStore.setAuth({
        accessToken: persistedToken,
        companyId: inMemoryUser.company_id ?? authStore.companyId ?? '',
        companyName: inMemoryUser.company_name ?? authStore.companyName ?? '',
        email: inMemoryUser.email ?? authStore.email ?? '',
      });

      if (persistedToken && shouldRefreshSession(persistedToken)) {
        try {
          const response = await authClient.refresh();
          const refreshedToken = response.data?.access_token;
          if (refreshedToken) {
            const refreshedUser = { ...parsedUser, access_token: refreshedToken };
            persistSession(refreshedUser);
            useAuthStore.getState().setAuth({
              accessToken: refreshedToken,
              companyId: refreshedUser.company_id ?? '',
              companyName: refreshedUser.company_name ?? '',
              email: refreshedUser.email ?? '',
            });
            setUser(refreshedUser);
            window.dispatchEvent(new Event('auth:changed'));
          }
        } catch {
          persistSession(inMemoryUser);
          useAuthStore.getState().setAuth({
            accessToken: persistedToken,
            companyId: inMemoryUser.company_id ?? authStore.companyId ?? '',
            companyName: inMemoryUser.company_name ?? authStore.companyName ?? '',
            email: inMemoryUser.email ?? authStore.email ?? '',
          });
          setUser(inMemoryUser);
        }
      }
    } catch {
      persistSession(null);
      useAuthStore.getState().logout();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    syncUserFromStorage();
    window.addEventListener('auth:changed', syncUserFromStorage);
    return () => window.removeEventListener('auth:changed', syncUserFromStorage);
  }, []);

  const login = async (email, password) => {
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', password);

    const response = await authClient.login(email, password);

    const data = response.data;
    const normalizedUser = {
      access_token: data.access_token,
      email: data.email,
      company_name: data.company_name,
      company_id: data.company_id,
    };

    persistSession(normalizedUser);
    useAuthStore.getState().setAuth({
      accessToken: data.access_token,
      companyId: data.company_id,
      companyName: data.company_name,
      email: data.email,
    });
    setUser(normalizedUser);
    window.dispatchEvent(new Event('auth:changed'));
    return normalizedUser;
  };

  const register = async (name, email, password) => {
    const response = await authClient.register(name, email, password);
    return response.data;
  };

  const logout = async () => {
    try {
      await authClient.logout();
    } catch {
      // Ignore logout failures and clear local state.
    }

    persistSession(null);
    useAuthStore.getState().logout();
    setUser(null);
    window.dispatchEvent(new Event('auth:changed'));
  };

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
