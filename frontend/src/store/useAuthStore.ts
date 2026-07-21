import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const getStoredUser = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawUser = window.localStorage.getItem("user");
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
};

export interface AuthState {
  accessToken: string | null;
  companyId: string | null;
  companyName: string | null;
  email: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isAccountBlocked: boolean;

  setAuth: (data: {
    accessToken: string;
    companyId: string;
    companyName: string;
    email: string;
  }) => void;
  setAccessToken: (token: string) => void;
  setAccountBlocked: (blocked: boolean) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  hydrateFromStorage: () => void;
  logout: (options?: { preserveBlocked?: boolean }) => void;
  clearError: () => void;
}

const isUsableToken = (token: string | null | undefined) => typeof token === "string" && token.trim() !== "" && token !== "••••••••" && token.length > 20;

const initialState = {
  accessToken: null as string | null,
  companyId: null as string | null,
  companyName: null as string | null,
  email: null as string | null,
  isAuthenticated: false,
  isLoading: false,
  error: null as string | null,
  isAccountBlocked: false,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,

      setAuth: (data) =>
        set({
          accessToken: data.accessToken ?? null,
          companyId: data.companyId,
          companyName: data.companyName,
          email: data.email,
          isAuthenticated: true,
          error: null,
          isLoading: false,
          isAccountBlocked: false,
        }),

      setAccessToken: (token) =>
        set({
          accessToken: token ?? null,
          isAuthenticated: Boolean(token),
        }),

      setAccountBlocked: (blocked) =>
        set({
          isAccountBlocked: blocked,
        }),

      setError: (error) =>
        set({
          error,
        }),

      setLoading: (loading) =>
        set({
          isLoading: loading,
        }),

      hydrateFromStorage: () => {
        const storedUser = getStoredUser();

        if (isUsableToken(storedUser?.access_token)) {
          set({
            accessToken: storedUser.access_token ?? null,
            companyId: storedUser.company_id ?? null,
            companyName: storedUser.company_name ?? null,
            email: storedUser.email ?? null,
            isAuthenticated: true,
            error: null,
            isLoading: false,
            isAccountBlocked: false,
          });
          return;
        }

        set(initialState);
      },

      logout: (options) =>
        set((state) => ({
          accessToken: null,
          companyId: null,
          companyName: null,
          email: null,
          isAuthenticated: false,
          error: null,
          isLoading: false,
          isAccountBlocked: options?.preserveBlocked ? state.isAccountBlocked : false,
        })),

      clearError: () =>
        set({
          error: null,
        }),
    }),
    {
      name: "auth-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        companyId: state.companyId,
        companyName: state.companyName,
        email: state.email,
        isAuthenticated: state.isAuthenticated,
        isAccountBlocked: state.isAccountBlocked,
      }),
    }
  )
);
