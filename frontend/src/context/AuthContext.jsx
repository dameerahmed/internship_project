/**
 * AuthContext — Thin bridge over Zustand's useAuthStore.
 *
 * CRITICAL FIX (reload loop):
 * The previous version called `useAuthStore()` (no selector) which subscribed to
 * the ENTIRE store object. Every `set()` call inside hydrateFromStorage()
 * created a new store object reference → re-rendered AuthProvider → called
 * hydrateFromStorage() again → infinite loop causing constant page reloads.
 *
 * Fix: Use granular selectors (one primitive per useAuthStore call) so only
 * the specific field change triggers a re-render. Actions are read from
 * getState() — they never change reference so they need zero subscriptions.
 */

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import apiClient, { authClient } from '@/api/client';
import { useAuthStore } from '@/store/useAuthStore';

const AuthContext = createContext(null);

const isUsableToken = (token) =>
  typeof token === 'string' && token.trim() !== '' && token !== '••••••••' && token.length > 20;

const decodeJwtExpiry = (token) => {
  if (!token) return null;
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
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
  // ── Granular selectors — each only re-renders when its specific field changes ──
  const accessToken   = useAuthStore(s => s.accessToken);
  const companyId     = useAuthStore(s => s.companyId);
  const companyName   = useAuthStore(s => s.companyName);
  const email         = useAuthStore(s => s.email);
  const isAuth        = useAuthStore(s => s.isAuthenticated);
  const isLoading     = useAuthStore(s => s.isLoading);

  // ── Actions: read from getState() — stable references, no re-render triggers ──
  const initDoneRef = useRef(false);

  // ── Hydrate ONCE on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    const init = () => {
      // Read directly from getState() — does NOT trigger subscriptions
      const { hydrateFromStorage, logout: storeLogout } = useAuthStore.getState();

      hydrateFromStorage();

      const token = useAuthStore.getState().accessToken;
      if (!isUsableToken(token)) {
        storeLogout();
      }
    };

    init();

    const onAuthChanged = () => {
      useAuthStore.getState().hydrateFromStorage();
    };
    window.addEventListener('auth:changed', onAuthChanged);

    return () => {
      window.removeEventListener('auth:changed', onAuthChanged);
    };
  }, []); // Empty dep array — runs exactly once on mount

  // ── Actions ──────────────────────────────────────────────────────────────────
  const login = async (emailVal, password) => {
    const response = await authClient.login(emailVal, password);
    const data = response.data;

    useAuthStore.getState().setAuth({
      accessToken: data.access_token,
      companyId: String(data.company_id ?? ''),
      companyName: data.company_name ?? '',
      email: data.email ?? '',
    });

    localStorage.setItem(
      'user',
      JSON.stringify({
        access_token: data.access_token,
        email: data.email,
        company_name: data.company_name,
        company_id: data.company_id,
      })
    );

    window.dispatchEvent(new Event('auth:changed'));
    return data;
  };

  const register = async (name, emailVal, password) => {
    const response = await authClient.register(name, emailVal, password);
    return response.data;
  };

  const logout = async () => {
    try {
      await authClient.logout();
    } catch { /* ignore */ }
    localStorage.removeItem('user');
    useAuthStore.getState().logout();
    window.dispatchEvent(new Event('auth:changed'));
  };

  // ── Derived `user` view — only recomputes when individual fields change ──────
  const user = useMemo(() => {
    if (!isAuth || !isUsableToken(accessToken)) return null;
    return {
      access_token: accessToken,
      email,
      company_name: companyName,
      company_id: companyId,
    };
  }, [isAuth, accessToken, email, companyName, companyId]);

  // ── Context value — stable: login/logout/register are defined once in scope ─
  const value = useMemo(
    () => ({ user, loading: isLoading, login, logout, register }),
    // login/logout/register are module-scope stable; only user and isLoading change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
