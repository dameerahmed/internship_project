import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '@/utils/constants';
import { useAuthStore } from '@/store/useAuthStore';

const MASKED_VALUE = '••••••••';
let isRefreshing = false;
let failedQueue = [];

const isUsableToken = (value) => typeof value === 'string' && value.trim() !== '' && value !== MASKED_VALUE && value.length > 20;

const apiClient = axios.create({
  baseURL: API_BASE_URL || undefined,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

const getStoredUser = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const authStore = useAuthStore.getState();
  const fallbackToken = isUsableToken(authStore.accessToken) ? authStore.accessToken : null;

  try {
    const stored = window.localStorage.getItem('user');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (isUsableToken(parsed?.access_token)) {
        return parsed;
      }
      if (fallbackToken) {
        return { ...parsed, access_token: fallbackToken };
      }
      return parsed;
    }
  } catch {
    // Ignore malformed storage payloads and fall back to the in-memory auth store.
  }

  if (fallbackToken) {
    return { access_token: fallbackToken };
  }

  return null;
};

export const getErrorMessage = (error) => {
  const data = error?.response?.data;
  if (typeof data === 'string') {
    return data;
  }

  if (typeof data?.detail === 'string') {
    return data.detail;
  }

  if (typeof data?.message === 'string') {
    return data.message;
  }

  return error?.message || 'Request failed';
};

apiClient.interceptors.request.use((config) => {
  const token = getStoredUser()?.access_token;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const processQueue = (error, token = null) => {
  failedQueue.forEach((item) => {
    if (error) {
      item.reject(error);
      return;
    }
    item.resolve(token ? { ...item.config, headers: { ...item.config.headers, Authorization: `Bearer ${token}` } } : item.config);
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/refresh') || originalRequest?.url?.includes('/auth/login');
    if (error?.response?.status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject, config: originalRequest });
        }).then((config) => apiClient.request(config));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await authClient.refresh();
        const refreshedToken = response?.data?.access_token;
        if (!refreshedToken) {
          throw new Error('missing token');
        }

        const authStore = useAuthStore.getState();
        authStore.setAuth({
          accessToken: refreshedToken,
          companyId: authStore.companyId ?? '',
          companyName: authStore.companyName ?? '',
          email: authStore.email ?? '',
        });
        window.localStorage.setItem('user', JSON.stringify({ access_token: refreshedToken }));
        processQueue(null, refreshedToken);
        return apiClient.request({ ...originalRequest, headers: { ...originalRequest.headers, Authorization: `Bearer ${refreshedToken}` } });
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        window.localStorage.removeItem('user');
        window.location.assign('/login');
        return Promise.reject(new Error(getErrorMessage(refreshError)));
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(new Error(getErrorMessage(error)));
  }
);

export const authClient = {
  login: (username, password) =>
    apiClient.post(
      API_ENDPOINTS.AUTH.LOGIN,
      new URLSearchParams({ username, password }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    ),
  register: (name, email, password) =>
    apiClient.post(API_ENDPOINTS.AUTH.REGISTER, { name, email, password }),
  refresh: () => apiClient.post(API_ENDPOINTS.AUTH.REFRESH, {}, { withCredentials: true }),
  logout: () => apiClient.post(API_ENDPOINTS.AUTH.LOGOUT, {}, { withCredentials: true }),
};

export default apiClient;
