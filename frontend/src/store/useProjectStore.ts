import { create } from "zustand";

export interface EventConfigItem {
  id?: number;
  event_type: string;
  target_url?: string;
  metadata_json?: any;
  is_active?: boolean;
  retention_days?: number;
  delete_time?: string;
  payload_keys?: string[];
  payload_types?: string[];
}

export interface ProjectDetail {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  retention_days?: number;
  company_id: number;
  created_at?: string;
  updated_at?: string;
  event_configs?: EventConfigItem[];
  metadata_json?: any;
}

export interface ProjectSummary {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  company_id: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectMetrics {
  project_id: number;
  project_name: string;
  is_active: boolean;
  total_webhooks_24h: number;
  success_rate_pct: number;
  failure_rate_pct: number;
  avg_latency_ms: number;
  dlq_count: number;
  throughput_series: Array<{
    timestamp: string;
    label: string;
    total: number;
    success: number;
    failed: number;
  }>;
}

export interface CompanyMetrics {
  total_webhooks_24h: number;
  success_rate_pct: number;
  failure_rate_pct: number;
  avg_latency_ms: number;
  active_projects_count: number;
  total_projects_count: number;
  total_dlq_count: number;
  throughput_series: Array<{
    timestamp: string;
    label: string;
    total: number;
    success: number;
    failed: number;
  }>;
}

export type ProjectTabType = "overview" | "events" | "simulator" | "logs" | "dlq" | "settings" | "security";

interface ProjectStoreState {
  // Global Company State
  companyProjects: ProjectSummary[];
  companyMetrics: CompanyMetrics | null;
  companyMetricsLoading: boolean;

  // Active Isolated Project State
  activeProjectId: number | null;
  activeProject: ProjectDetail | null;
  projectMetrics: ProjectMetrics | null;
  projectCredentials: { api_key: string; secret_key: string } | null;
  projectLoading: boolean;
  activeTab: ProjectTabType;

  // Actions
  setCompanyProjects: (projects: ProjectSummary[]) => void;
  setCompanyMetrics: (metrics: CompanyMetrics | null) => void;
  setCompanyMetricsLoading: (loading: boolean) => void;
  
  setActiveProject: (project: ProjectDetail | null) => void;
  setProjectMetrics: (metrics: ProjectMetrics | null) => void;
  setProjectCredentials: (creds: { api_key: string; secret_key: string } | null) => void;
  setProjectLoading: (loading: boolean) => void;
  setActiveTab: (tab: ProjectTabType) => void;

  // Explicit anti-stale state cleaner when switching or leaving project views
  clearActiveProject: () => void;
  resetAll: () => void;
}

const initialCompanyState = {
  companyProjects: [],
  companyMetrics: null,
  companyMetricsLoading: false,
};

const initialProjectState = {
  activeProjectId: null,
  activeProject: null,
  projectMetrics: null,
  projectCredentials: null,
  projectLoading: false,
  activeTab: "overview" as ProjectTabType,
};

export const useProjectStore = create<ProjectStoreState>()((set) => ({
  ...initialCompanyState,
  ...initialProjectState,

  setCompanyProjects: (companyProjects) => set({ companyProjects }),
  setCompanyMetrics: (companyMetrics) => set({ companyMetrics }),
  setCompanyMetricsLoading: (companyMetricsLoading) => set({ companyMetricsLoading }),

  setActiveProject: (project) =>
    set({
      activeProject: project,
      activeProjectId: project ? project.id : null,
    }),

  setProjectMetrics: (projectMetrics) => set({ projectMetrics }),
  setProjectCredentials: (projectCredentials) => set({ projectCredentials }),
  setProjectLoading: (projectLoading) => set({ projectLoading }),
  setActiveTab: (activeTab) => set({ activeTab }),

  clearActiveProject: () =>
    set({
      activeProjectId: null,
      activeProject: null,
      projectMetrics: null,
      projectCredentials: null,
      projectLoading: false,
      activeTab: "overview",
    }),

  resetAll: () =>
    set({
      ...initialCompanyState,
      ...initialProjectState,
    }),
}));
