const isClient = typeof window !== "undefined";
const wsProtocol = isClient && window.location.protocol === "https:" ? "wss:" : "ws:";

const fallbackApiBase = "";
const fallbackWsBase = isClient ? `${wsProtocol}//${window.location.host}` : "ws://127.0.0.1:8000";

// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? fallbackApiBase;
export const WS_BASE_URL = import.meta.env.VITE_WS_URL ?? fallbackWsBase;

// API Endpoints
export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: "/auth/register",
    LOGIN: "/auth/login",
    REFRESH: "/auth/refresh",
    LOGOUT: "/auth/logout",
  },
  PROJECTS: {
    LIST: "/v1/projects/",
    CREATE: "/v1/projects/Create",
    GET: (id: string | number) => `/v1/projects/${id}`,
    DETAIL: (id: string | number) => `/v1/projects/${id}`,
    UPDATE: (id: string | number) => `/v1/projects/${id}`,
    DELETE: (id: string | number) => `/v1/projects/${id}`,
    EVENT_UPDATE: (projectId: string | number, eventId: string | number) => `/v1/projects/${projectId}/events/${eventId}`,
  },
  WEBHOOKS: {
    LOGS: (projectId: string | number) => `/v1/projects/${projectId}/webhook-logs`,
  },
  METRICS: {
    COMPANY: "/v1/metrics/company",
    PROJECT: (id: string | number) => `/v1/metrics/project/${id}`,
  },
};

// WebSocket Endpoints
// ⚠️  Security: company_id is NO LONGER part of the URL.
// The server reads it exclusively from the JWT (?token= param).
// The token parameter is appended by the caller using withToken() helper below.
export const WS_ENDPOINTS = {
  /** Live webhook log stream for a project. Always append ?token= */
  LOGS: (projectId: string | number) => `${WS_BASE_URL}/ws/logs/${projectId}`,
  /** Company DLQ stream. company_id is taken from JWT server-side. Always append ?token= */
  DLQ: () => `${WS_BASE_URL}/ws/dlq`,
  /** Dashboard metrics stream. company_id is taken from JWT server-side. Always append ?token= */
  DASHBOARD: () => `${WS_BASE_URL}/ws/dashboard`,
};

/**
 * Append the access token as a query parameter so the WebSocket server
 * can authenticate without HTTP headers (browsers don't support WS auth headers).
 */
export const withToken = (url: string, token: string | null | undefined): string => {
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
};

// Theme Colors (Dark-Modern)
export const THEME = {
  colors: {
    primary: "#10b981", // Emerald-500
    secondary: "#6366f1", // Indigo-500
    background: "#020617", // Slate-950
    surface: "#18181b", // Zinc-900
    surfaceLight: "#27272a", // Zinc-800
    text: {
      primary: "#f4f4f5", // Zinc-50
      secondary: "#a1a1aa", // Zinc-400
      muted: "#71717a", // Zinc-500
    },
    error: "#ef4444", // Red-500
    warning: "#f59e0b", // Amber-500
    success: "#10b981", // Emerald-500
    info: "#3b82f6", // Blue-500
  },
  radius: {
    xs: "0.25rem",
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    full: "9999px",
  },
  shadows: {
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
  },
};

// Security
export const SECURITY = {
  TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // 5 minutes before expiry
  SECRET_DISPLAY_DURATION: 10 * 1000, // 10 seconds
  ACCOUNT_BLOCK_DURATION: 24 * 60 * 60 * 1000, // 24 hours
};

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK: "Network error. Please check your connection.",
  UNAUTHORIZED: "Please login again.",
  ACCOUNT_BLOCKED:
    "Your account has been blocked for 24 hours due to suspicious activity.",
  TOKEN_EXPIRED: "Your session has expired. Please login again.",
  INVALID_CREDENTIALS: "Invalid email or password.",
  SERVER_ERROR: "Server error. Please try again later.",
  INVALID_TOKEN: "Invalid or corrupted token.",
};

// Success Messages
export const SUCCESS_MESSAGES = {
  LOGIN: "Logged in successfully!",
  PROJECT_CREATED: "Project created successfully!",
  PROJECT_UPDATED: "Project updated successfully!",
  SECRET_COPIED: "Secret copied to clipboard!",
};
