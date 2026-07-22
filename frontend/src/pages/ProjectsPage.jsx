import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Search, Trash2 } from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';
import { createProjectPayload } from '@/utils/projectPayloads';

const blankForm = {
  name: '',
  description: '',
  eventConfigs: [{ event_type: 'webhook.received', target_urls: ['https://example.com/webhook'] }],
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(() => sessionStorage.getItem('selectedProjectId') || '');
  const [form, setForm] = useState(blankForm);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [togglingId, setTogglingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

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
      setFeedback({ type: 'success', message: `${created.name} created successfully. Redirecting to project detail...` });
      navigate(`/projects/${created.id}`);
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Unable to create project.' });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleProject = async (project) => {
    const nextState = !project.is_active;
    const previousProject = project;
    setTogglingId(project.id);
    setProjects((prev) => prev.map((item) => (item.id === project.id ? { ...item, is_active: nextState } : item)));

    try {
      await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(project.id), { is_active: nextState });
      setFeedback({ type: 'success', message: `Project ${project.name} has been ${nextState ? 'resumed' : 'paused'}.` });
    } catch (error) {
      setProjects((prev) => prev.map((item) => (item.id === project.id ? previousProject : item)));
      setFeedback({ type: 'error', message: error.message || 'Unable to update project status.' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm('Delete project node? This will remove all project rules.')) return;
    try {
      await apiClient.delete(API_ENDPOINTS.PROJECTS.DELETE(id));
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (String(selectedProjectId) === String(id)) {
        const remaining = projects.filter((p) => p.id !== id);
        setSelectedProjectId(remaining.length ? String(remaining[0].id) : '');
      }
      setFeedback({ type: 'success', message: 'Project removed successfully.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Unable to delete project.' });
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchSearch =
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (project.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });
  }, [projects, searchTerm]);

  return (
    <ProtectedLayout title="Project Nodes & Routing" eyebrow="Management">
      <div className="space-y-6">
        {/* Header Toolbar */}
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-zinc-800 bg-[#08090e] p-6 shadow-xl">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Projects Inventory</h1>
            <p className="mt-1 text-xs text-zinc-400 font-mono">Create, monitor, and manage routing projects for your organization.</p>
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-xs font-mono font-bold text-zinc-950 transition active:scale-95 shadow-md"
            onClick={() => setShowCreateForm((prev) => !prev)}
            type="button"
          >
            <Plus className="h-4 w-4" />
            {showCreateForm ? 'Cancel' : 'Create New Project'}
          </button>
        </section>

        {/* Create Project Form */}
        {showCreateForm ? (
          <div className="rounded-3xl border border-zinc-800 bg-[#0c0d15] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white">Create new project node</h3>
            <p className="mt-1 text-xs text-zinc-400 font-mono">Provision a project to start routing webhooks.</p>
            <form className="mt-5 space-y-4" onSubmit={handleCreate}>
              <div>
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1" htmlFor="project-name">Project Name</label>
                <input
                  id="project-name"
                  className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-emerald-400"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="e.g. Billing Service Webhooks"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1" htmlFor="project-description">Description</label>
                <textarea
                  id="project-description"
                  className="min-h-20 w-full rounded-xl border border-zinc-800 bg-[#080910] px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-emerald-400"
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Describe the purpose of this project routing node..."
                />
              </div>

              <div>
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-mono font-bold text-xs text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
                  disabled={creating}
                  type="submit"
                >
                  <Plus className="h-4 w-4" />
                  {creating ? 'Creating project…' : 'Create Project Node'}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {feedback.message ? (
          <div className={`rounded-xl px-4 py-3 text-xs font-mono ${feedback.type === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
            {feedback.message}
          </div>
        ) : null}

        {/* Project Cards List */}
        <section className="rounded-3xl border border-zinc-800 bg-[#0c0d15] p-6 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-zinc-800/60 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white">Project Inventory</h3>
              <p className="mt-1 text-xs text-zinc-400 font-mono">Select any project to configure keys, event rules, and test webhooks.</p>
            </div>
            <div className="w-full sm:w-72">
              <label className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#080910] px-3 py-2 text-xs text-zinc-300">
                <Search className="h-4 w-4 text-zinc-500" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search projects..."
                  className="w-full bg-transparent outline-none text-xs"
                />
              </label>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-zinc-800 bg-[#080910] p-4 text-xs font-mono text-zinc-500">Loading projects…</div>
            ) : filteredProjects.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-[#080910] p-4 text-xs font-mono text-zinc-500">No projects match that search yet. Create one above.</div>
            ) : (
              filteredProjects.map((project) => (
                <div key={project.id} className="rounded-2xl border border-zinc-800/80 bg-[#080910] p-4 transition hover:border-zinc-700">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <button className="flex items-center gap-2 text-left group" onClick={() => navigate(`/projects/${project.id}`)} type="button">
                        <span className="font-bold text-sm text-white group-hover:text-emerald-400 transition">{project.name}</span>
                        <ArrowRight className="h-4 w-4 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition" />
                      </button>
                      {project.description && (
                        <p className="mt-1 text-xs text-zinc-400 line-clamp-1">{project.description}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                        <span>Node ID: #{project.id}</span>
                        <span>•</span>
                        <span className={project.is_active ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
                          {project.is_active ? 'Active & Routing' : 'Paused'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        className={`relative h-6 w-11 rounded-full p-0.5 transition ${project.is_active ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                        onClick={() => handleToggleProject(project)}
                        disabled={togglingId === project.id}
                        type="button"
                        title={project.is_active ? 'Pause Project' : 'Resume Project'}
                      >
                        <span className={`block h-5 w-5 rounded-full bg-white transition ${project.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>

                      <button
                        className="rounded-xl border border-zinc-800 bg-[#121420] px-3.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-[#181a2b] transition"
                        onClick={() => navigate(`/projects/${project.id}`)}
                        type="button"
                      >
                        Configure Project →
                      </button>

                      <button
                        className="rounded-xl border border-zinc-800 p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition active:scale-95"
                        onClick={() => handleDeleteProject(project.id)}
                        type="button"
                        title="Delete Project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </ProtectedLayout>
  );
}
