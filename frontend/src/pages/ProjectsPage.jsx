import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Search, Trash2, Layers, Calendar, Zap, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
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
  const [showCreateModal, setShowCreateModal] = useState(false);

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
      setShowCreateModal(false);
      setFeedback({ type: 'success', message: `Project "${created.name}" created successfully!` });
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
      setFeedback({ type: 'success', message: `Project "${project.name}" ${nextState ? 'activated' : 'paused'}.` });
    } catch (error) {
      setProjects((prev) => prev.map((item) => (item.id === project.id ? previousProject : item)));
      setFeedback({ type: 'error', message: error.message || 'Unable to update project status.' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm('Are you sure you want to delete this project? All associated routing rules will be removed.')) return;
    try {
      await apiClient.delete(API_ENDPOINTS.PROJECTS.DELETE(id));
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (String(selectedProjectId) === String(id)) {
        const remaining = projects.filter((p) => p.id !== id);
        setSelectedProjectId(remaining.length ? String(remaining[0].id) : '');
      }
      setFeedback({ type: 'success', message: 'Project deleted successfully.' });
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
    <ProtectedLayout title="Projects Workspace" eyebrow="Overview">
      <div className="max-w-6xl mx-auto space-y-8 py-2">
        
        {/* Executive Header Banner */}
        <section className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-zinc-800/80 bg-gradient-to-r from-[#0c0d17] via-[#090a12] to-[#0d0e19] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 h-48 w-48 bg-emerald-500/5 blur-3xl rounded-full pointer-events-none" />
          <div className="space-y-1.5 relative z-10">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <span>Projects Workspace</span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-xl leading-relaxed">
              Create, configure, and monitor webhook routing endpoints, payload schemas, and data retention schedules.
            </p>
          </div>

          <button
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3.5 text-xs font-bold text-zinc-950 transition active:scale-95 shadow-lg shadow-emerald-500/20 shrink-0 relative z-10"
            onClick={() => setShowCreateModal(true)}
            type="button"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Create New Project</span>
          </button>
        </section>

        {/* Global Feedback Banner */}
        {feedback.message && (
          <div className={`rounded-2xl px-5 py-3.5 text-xs font-semibold flex items-center justify-between gap-3 ${feedback.type === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
            <div className="flex items-center gap-2.5">
              {feedback.type === 'error' ? <ShieldAlert size={16} /> : <CheckCircle2 size={16} />}
              <span>{feedback.message}</span>
            </div>
            <button type="button" onClick={() => setFeedback({ type: '', message: '' })} className="text-xs opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Projects Grid Section */}
        <section className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Active Routing Projects</h2>
              <p className="mt-1 text-xs text-zinc-400">Select any project node to view credentials, routing rules, or test webhooks.</p>
            </div>

            <div className="w-full sm:w-72">
              <label className="flex items-center gap-2.5 rounded-2xl border border-zinc-800 bg-[#0c0d15] px-4 py-2.5 text-xs text-zinc-300 shadow-inner">
                <Search className="h-4 w-4 text-zinc-500" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search projects..."
                  className="w-full bg-transparent outline-none text-xs text-white placeholder-zinc-500"
                />
              </label>
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-zinc-800 bg-[#0c0d15] p-12 text-center text-xs font-semibold text-zinc-400">
              Loading projects inventory…
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="rounded-3xl border border-zinc-800/80 bg-[#0c0d15] p-12 text-center space-y-3">
              <Layers size={32} className="mx-auto text-zinc-600" />
              <p className="text-sm font-semibold text-zinc-300">No projects match your search.</p>
              <p className="text-xs text-zinc-500">Create a new project node to begin receiving and forwarding webhooks.</p>
            </div>
          ) : (
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
              {filteredProjects.map((project) => (
                <div 
                  key={project.id} 
                  className="rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-[#0d0e18] to-[#090a12] p-7 space-y-6 transition duration-200 hover:border-emerald-500/40 hover:shadow-2xl hover:shadow-emerald-500/5 flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    {/* Top Row: Name + Status Badge */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <button className="text-left" onClick={() => navigate(`/projects/${project.id}`)} type="button">
                          <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition flex items-center gap-2">
                            <span>{project.name}</span>
                            <ArrowRight className="h-4 w-4 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-1.5 transition" />
                          </h3>
                        </button>
                        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                          {project.description || 'No description provided for this project.'}
                        </p>
                      </div>

                      {project.is_active ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20 shrink-0">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-3.5 py-1 text-xs font-semibold text-zinc-400 border border-zinc-500/20 shrink-0">
                          <span className="h-2 w-2 rounded-full bg-zinc-500" />
                          Paused
                        </span>
                      )}
                    </div>

                    {/* Metadata Chips */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-medium">
                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-[#080910] px-3 py-1.5 text-xs text-zinc-300">
                        <Layers size={13} className="text-cyan-400" />
                        Node ID: #{project.id}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-[#080910] px-3 py-1.5 text-xs text-zinc-300">
                        <Zap size={13} className="text-amber-400" />
                        {project.event_configs?.length || 1} Event Routes
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-[#080910] px-3 py-1.5 text-xs text-zinc-300">
                        <Calendar size={13} className="text-emerald-400" />
                        {project.retention_days || 30}d Retention
                      </span>
                    </div>
                  </div>

                  {/* Card Bottom Controls */}
                  <div className="flex items-center justify-between border-t border-zinc-800/80 pt-5 mt-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs text-zinc-400 font-medium">Status:</span>
                      <button
                        className={`relative h-6 w-11 rounded-full p-0.5 transition ${project.is_active ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                        onClick={() => handleToggleProject(project)}
                        disabled={togglingId === project.id}
                        type="button"
                        title={project.is_active ? 'Pause Project' : 'Activate Project'}
                      >
                        <span className={`block h-5 w-5 rounded-full bg-white transition ${project.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition active:scale-95"
                        onClick={() => navigate(`/projects/${project.id}`)}
                        type="button"
                      >
                        <span>Configure Project</span>
                        <ArrowRight size={13} />
                      </button>

                      <button
                        className="rounded-xl border border-zinc-800 p-2 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition active:scale-95"
                        onClick={() => handleDeleteProject(project.id)}
                        type="button"
                        title="Delete Project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* CREATE PROJECT BACKDROP MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-zinc-800 bg-[#0c0d15] shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 p-6 bg-[#10121d]">
              <div>
                <h3 className="text-lg font-bold text-white">Create New Project Node</h3>
                <p className="text-xs text-zinc-400">Provision a project to route and validate webhooks.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-zinc-800 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form className="p-6 space-y-5" onSubmit={handleCreate}>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-300" htmlFor="project-name">Project Name</label>
                <input
                  id="project-name"
                  className="w-full rounded-xl border border-zinc-800 bg-[#080910] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="e.g. Stripe Payment Gateways"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-300" htmlFor="project-description">Description</label>
                <textarea
                  id="project-description"
                  className="min-h-24 w-full rounded-xl border border-zinc-800 bg-[#080910] p-4 text-sm text-zinc-200 outline-none focus:border-emerald-400"
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Describe the purpose of this project..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-zinc-800 px-5 py-2.5 text-xs font-semibold text-zinc-400 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 font-bold text-xs text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50 shadow-md"
                  disabled={creating}
                  type="submit"
                >
                  <Plus className="h-4 w-4" />
                  <span>{creating ? 'Creating project…' : 'Create Project'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProtectedLayout>
  );
}
