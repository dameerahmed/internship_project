import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, KeyRound, Plus, Search, Trash2 } from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';
import { createProjectPayload } from '@/utils/projectPayloads';

const blankForm = {
  name: '',
  description: '',
  eventConfigs: [{ event_type: 'webhook.received', target_urls: ['https://example.com/webhook'] }],
};

const maskedSecret = '••••••••••••••••••••••••••••••';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(() => sessionStorage.getItem('selectedProjectId') || '');
  const [form, setForm] = useState(blankForm);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [generatedKeys, setGeneratedKeys] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [revealedId, setRevealedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === String(selectedProjectId)) || null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    let cancelled = false;
    const loadProjects = async () => {
      setLoading(true);
      try {
        const { data } = await apiClient.get(API_ENDPOINTS.PROJECTS.LIST);
        if (!cancelled) {
          setProjects(Array.isArray(data) ? data : []);
          if (!selectedProjectId && Array.isArray(data) && data.length) {
            setSelectedProjectId(String(data[0].id));
          }
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({ type: 'error', message: error.message || 'Unable to load projects.' });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      sessionStorage.setItem('selectedProjectId', selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (!generatedKeys) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRevealedId(null);
      setGeneratedKeys(null);
    }, 20000);

    return () => window.clearTimeout(timer);
  }, [generatedKeys]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setFeedback({ type: 'error', message: 'Please enter a project name.' });
      return;
    }

    setCreating(true);
    setFeedback({ type: '', message: '' });

    try {
      const payload = createProjectPayload({
        name: form.name,
        description: form.description,
        eventConfigs: form.eventConfigs,
        isActive: true,
        retentionDays: 30,
      });

      const { data: created } = await apiClient.post(API_ENDPOINTS.PROJECTS.CREATE, payload);
      setProjects((prev) => [created, ...prev]);
      setSelectedProjectId(String(created.id));
      setForm(blankForm);
      setShowCreateForm(false);
      setFeedback({ type: 'success', message: `${created.name} created successfully.` });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Unable to create project.' });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleProject = async (project) => {
    const nextState = !project.is_active;
    const previousProject = project;
    setProjects((prev) => prev.map((item) => (item.id === project.id ? { ...item, is_active: nextState } : item)));
    setFeedback({ type: 'success', message: `Project ${project.name} has been ${nextState ? 'resumed' : 'paused'}.` });
    setTogglingId(project.id);
    try {
      const { data: updated } = await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(project.id), { is_active: nextState });
      const safeProject = { ...project, ...updated, is_active: updated.is_active ?? nextState };
      setProjects((prev) => prev.map((item) => (item.id === project.id ? safeProject : item)));
    } catch (error) {
      setProjects((prev) => prev.map((item) => (item.id === project.id ? previousProject : item)));
      setFeedback({ type: 'error', message: error.message || 'Unable to update project.' });
    } finally {
      setTogglingId(null);
    }
  };

  const updateEventConfig = (index, updater) => {
    setForm((prev) => ({
      ...prev,
      eventConfigs: prev.eventConfigs.map((config, configIndex) => (configIndex === index ? updater(config) : config)),
    }));
  };

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm('Delete this project and its webhook config?')) {
      return;
    }

    try {
      await apiClient.delete(API_ENDPOINTS.PROJECTS.DELETE(projectId));
      setProjects((prev) => prev.filter((project) => project.id !== projectId));
      if (String(selectedProjectId) === String(projectId)) {
        setSelectedProjectId('');
      }
      setFeedback({ type: 'success', message: 'Project removed successfully.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Unable to delete project.' });
    }
  };

  const handleGenerateKeys = async () => {
    if (!selectedProjectId) {
      setFeedback({ type: 'error', message: 'Select a project first.' });
      return;
    }

    setFeedback({ type: '', message: '' });

    try {
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${selectedProjectId}`);
      setGeneratedKeys({
        api_key: data.api_key,
        secret_key: data.secret_key,
      });
      setRevealedId(null);
      setFeedback({ type: 'success', message: 'Credentials generated. The secret stays masked until you reveal it.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Unable to generate keys.' });
    }
  };

  useEffect(() => {
    if (!revealedId) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRevealedId(null);
    }, 20000);

    return () => window.clearTimeout(timer);
  }, [revealedId]);

  const stats = useMemo(() => [
    { label: 'Projects', value: projects.length },
    { label: 'Selected', value: selectedProject ? selectedProject.name : 'None' },
    { label: 'Active', value: projects.filter((project) => project.is_active).length },
  ], [projects.length, projects, selectedProject]);

  const filteredProjects = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return projects;
    }

    return projects.filter((project) => `${project.name}`.toLowerCase().includes(query));
  }, [projects, searchTerm]);

  return (
    <ProtectedLayout title="Projects Setup" eyebrow="Inventory">
      <section className="rounded-[28px] border border-zinc-200/70 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-500">Project registry</p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Create projects, route traffic, and protect credentials with a secure workspace flow.</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Every project gets its own route, retention window, and live inspection view so operations stay predictable.</p>
          </div>
          <button type="button" onClick={() => setShowCreateForm((value) => !value)} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-300">
            <Plus className="h-4 w-4" />
            {showCreateForm ? 'Hide form' : 'New project'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <div key={item.label} className="rounded-2xl border border-zinc-200/70 bg-white/80 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500 dark:text-zinc-400">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4">
        {showCreateForm ? (
          <div className="rounded-[28px] border border-zinc-200/70 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Create a project</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Register a target webhook endpoint and keep the route ready for live traffic.</p>
              </div>
              <button type="button" onClick={() => setShowCreateForm(false)} className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">Close</button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
              <div className="space-y-2">
                <label htmlFor="project-name" className="block text-sm font-medium text-zinc-600 dark:text-zinc-400">Project name</label>
                <input id="project-name" className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="e.g. Billing alerts" />
              </div>

              <div className="space-y-2">
                <label htmlFor="project-description" className="block text-sm font-medium text-zinc-600 dark:text-zinc-400">Brief description</label>
                <textarea id="project-description" className="min-h-24 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="What is this project routing?" />
              </div>

              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                <div className="font-semibold">Fast setup</div>
                <p className="mt-1 text-sm">Only the essentials are required here. Advanced credentials can be provisioned after the project is created.</p>
              </div>

              <div>
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-400" disabled={creating} type="submit">
                  <Plus className="h-4 w-4" />
                  {creating ? 'Creating project…' : 'Create project'}
                </button>
              </div>
            </form>

            {feedback.message ? <div className={`mt-4 rounded-2xl px-3 py-3 text-sm ${feedback.type === 'error' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'}`}>{feedback.message}</div> : null}
          </div>
        ) : null}

        <div className="rounded-[28px] border border-zinc-200/70 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Project inventory</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Search projects, open management, and control flow state without leaving the page.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                <Search className="h-4 w-4" />
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search projects" className="w-full bg-transparent outline-none" />
              </label>
              <button className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800" onClick={handleGenerateKeys} disabled={!selectedProjectId} type="button">
                <KeyRound className="h-4 w-4" />
                Generate credentials
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-400">Loading projects…</div>
            ) : filteredProjects.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-400">No projects match that search yet. Create one to begin.</div>
            ) : (
              filteredProjects.map((project) => (
                <div key={project.id} className={`rounded-2xl border p-4 ${String(project.id) === String(selectedProjectId) ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/70'}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <button className="flex items-center gap-2 text-left" onClick={() => navigate(`/projects/${project.id}`)} type="button">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{project.name}</span>
                        <ArrowRight className="h-4 w-4 text-zinc-400" />
                      </button>
                      {project.description && (
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">{project.description}</p>
                      )}
                      <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{project.is_active ? 'Active and ready' : 'Paused'}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`rounded-full px-3 py-1 text-sm font-medium ${project.is_active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-zinc-500/10 text-zinc-500'}`}>{project.is_active ? 'Active' : 'Paused'}</span>
                      <button className={`relative h-7 w-12 rounded-full p-1 transition ${project.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`} onClick={() => handleToggleProject(project)} disabled={togglingId === project.id} type="button">
                        <span className={`block h-5 w-5 rounded-full bg-white transition ${project.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                      <button className="rounded-2xl border border-zinc-200 p-2 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800" onClick={() => handleDeleteProject(project.id)} type="button" aria-label="Delete project">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {generatedKeys ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Masked credentials</div>
              <div className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <div>
                  <span className="font-medium">API key</span>
                  <div className="mt-1 font-mono text-xs">{generatedKeys.api_key}</div>
                </div>
                <div>
                  <span className="font-medium">Webhook secret</span>
                  <div className="mt-1 flex items-center gap-2 font-mono text-xs">
                    <span>{revealedId === selectedProjectId ? generatedKeys.secret_key : maskedSecret}</span>
                    <button type="button" className="rounded-full border border-zinc-200 p-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300" onClick={() => setRevealedId((value) => value === selectedProjectId ? null : selectedProjectId)}>
                      {revealedId === selectedProjectId ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </ProtectedLayout>
  );
}
