import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  RefreshCw, 
  Globe, 
  Code2, 
  Key, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Edit3,
  ArrowRight,
  Send,
  FileJson
} from 'lucide-react';
import apiClient from '@/api/client';
import { API_ENDPOINTS } from '@/utils/constants';

export default function EventConfigTab({ project, onRefresh }) {
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  
  // Modal state for Add/Edit Event Rule
  const [showModal, setShowModal] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null);

  // Project API Credentials State
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Dynamic Event Form State
  const [eventForm, setEventForm] = useState({
    event_type: '',
    target_urls: ['https://api.yourcompany.com/webhooks/orders'],
    payload_rules: [
      { key: 'order_id', type: 'string' },
      { key: 'amount', type: 'number' },
      { key: 'currency', type: 'string' }
    ],
    is_active: true,
  });

  const eventConfigs = project?.event_configs || [];

  // Fetch project API credentials
  const fetchCredentials = async () => {
    if (!project?.id) return;
    try {
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${project.id}`);
      if (data?.api_key) setApiKey(data.api_key);
      if (data?.secret_key) setSecretKey(data.secret_key);
    } catch (err) {
      console.warn('Could not load project credentials:', err);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, [project?.id]);

  const handleRegenerateKeys = async () => {
    if (!project?.id) return;
    if (!window.confirm('Regenerate API Key and HMAC Secret Key for this project? Integrations using previous keys will stop working.')) return;

    setRegenerating(true);
    setFeedback({ type: '', message: '' });
    try {
      const { data } = await apiClient.get(`/v1/projects/refresh_keys/${project.id}?regenerate=true`);
      if (data?.api_key) setApiKey(data.api_key);
      if (data?.secret_key) setSecretKey(data.secret_key);
      setFeedback({ type: 'success', message: '✓ Project API Key & HMAC Secret Key regenerated successfully!' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to regenerate credentials.' });
    } finally {
      setRegenerating(false);
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  // Open modal for NEW Event Rule
  const handleOpenAddModal = () => {
    setEditingConfigId(null);
    setEventForm({
      event_type: '',
      target_urls: ['https://api.yourcompany.com/webhooks/events'],
      payload_rules: [
        { key: 'event_id', type: 'string' },
        { key: 'status', type: 'string' }
      ],
      is_active: true,
    });
    setShowModal(true);
  };

  // Open modal for EDITING / CONFIGURING specific Event Rule
  const handleOpenEditModal = (config) => {
    setEditingConfigId(config.id || config.event_type);
    
    const urls = Array.isArray(config.target_urls) && config.target_urls.length
      ? config.target_urls
      : (Array.isArray(config.metadata_json?.urls) && config.metadata_json.urls.length
        ? config.metadata_json.urls
        : [config.target_url || 'https://example.com/webhook']);

    const keys = config.payload_keys || config.metadata_json?.payload_keys || ['order_id'];
    const types = config.payload_types || config.metadata_json?.payload_types || ['string'];

    const rules = keys.map((k, i) => ({
      key: k,
      type: types[i] || 'string',
    }));

    setEventForm({
      event_type: config.event_type,
      target_urls: urls,
      payload_rules: rules.length ? rules : [{ key: 'order_id', type: 'string' }],
      is_active: config.is_active ?? true,
    });
    setShowModal(true);
  };

  // Dynamic URL Input handlers
  const handleAddUrl = () => {
    setEventForm(prev => ({
      ...prev,
      target_urls: [...prev.target_urls, 'https://api.yourcompany.com/webhooks/endpoint'],
    }));
  };

  const handleUpdateUrl = (index, value) => {
    setEventForm(prev => {
      const next = [...prev.target_urls];
      next[index] = value;
      return { ...prev, target_urls: next };
    });
  };

  const handleRemoveUrl = (index) => {
    if (eventForm.target_urls.length <= 1) return;
    setEventForm(prev => ({
      ...prev,
      target_urls: prev.target_urls.filter((_, i) => i !== index),
    }));
  };

  // Dynamic Payload Key Rule handlers
  const handleAddPayloadRule = () => {
    setEventForm(prev => ({
      ...prev,
      payload_rules: [...prev.payload_rules, { key: '', type: 'string' }],
    }));
  };

  const handleUpdatePayloadRule = (index, field, value) => {
    setEventForm(prev => {
      const next = [...prev.payload_rules];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, payload_rules: next };
    });
  };

  const handleRemovePayloadRule = (index) => {
    if (eventForm.payload_rules.length <= 1) return;
    setEventForm(prev => ({
      ...prev,
      payload_rules: prev.payload_rules.filter((_, i) => i !== index),
    }));
  };

  // Save Event Rule (Add or Edit)
  const handleSaveEventConfig = async (e) => {
    e.preventDefault();
    if (!eventForm.event_type.trim()) return;

    setSaving(true);
    setFeedback({ type: '', message: '' });

    try {
      const cleanUrls = eventForm.target_urls.map(u => u.trim()).filter(Boolean);
      const safeUrls = cleanUrls.length ? cleanUrls : ['https://example.com/webhook'];
      
      const cleanKeys = eventForm.payload_rules.map(r => r.key.trim()).filter(Boolean);
      const cleanTypes = eventForm.payload_rules.map(r => r.type);

      let updatedConfigs = [];

      if (editingConfigId) {
        // Update existing rule
        updatedConfigs = eventConfigs.map((ec) => {
          if (ec.id === editingConfigId || ec.event_type === editingConfigId) {
            return {
              event_type: eventForm.event_type.trim(),
              target_urls: safeUrls,
              payload_keys: cleanKeys,
              payload_types: cleanTypes,
              is_active: eventForm.is_active,
            };
          }
          return {
            event_type: ec.event_type,
            target_urls: Array.isArray(ec.target_urls) && ec.target_urls.length ? ec.target_urls : (Array.isArray(ec.metadata_json?.urls) && ec.metadata_json.urls.length ? ec.metadata_json.urls : [ec.target_url]),
            payload_keys: ec.payload_keys || ec.metadata_json?.payload_keys || ['event.id'],
            payload_types: ec.payload_types || ec.metadata_json?.payload_types || ['string'],
            is_active: ec.is_active ?? true,
          };
        });
      } else {
        // Append new rule
        const existingList = eventConfigs.map((ec) => ({
          event_type: ec.event_type,
          target_urls: Array.isArray(ec.target_urls) && ec.target_urls.length ? ec.target_urls : (Array.isArray(ec.metadata_json?.urls) && ec.metadata_json.urls.length ? ec.metadata_json.urls : [ec.target_url]),
          payload_keys: ec.payload_keys || ec.metadata_json?.payload_keys || ['event.id'],
          payload_types: ec.payload_types || ec.metadata_json?.payload_types || ['string'],
          is_active: ec.is_active ?? true,
        }));

        updatedConfigs = [
          ...existingList,
          {
            event_type: eventForm.event_type.trim(),
            target_urls: safeUrls,
            payload_keys: cleanKeys,
            payload_types: cleanTypes,
            is_active: eventForm.is_active,
          },
        ];
      }

      await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(project.id), {
        event_configs: updatedConfigs,
      });

      setFeedback({ 
        type: 'success', 
        message: `✓ Event routing rule "${eventForm.event_type}" ${editingConfigId ? 'updated' : 'configured'} successfully!` 
      });
      setShowModal(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save event rule.' });
    } finally {
      setSaving(false);
    }
  };

  // Test Webhook Dispatch for this specific event rule
  const handleTestDispatch = async (eventType, targetUrl) => {
    if (!project?.id) return;
    setTestingId(eventType);
    setFeedback({ type: '', message: '' });
    try {
      await apiClient.post(API_ENDPOINTS.WEBHOOKS.INGEST, {
        project_id: project.id,
        event_type: eventType,
        target_url: targetUrl || 'https://api.yourcompany.com/webhooks/test',
        payload: {
          test: true,
          timestamp: new Date().toISOString(),
          message: `Simulated webhook test dispatch for ${eventType}`
        }
      });
      setFeedback({
        type: 'success',
        message: `✓ Test webhook dispatched successfully for event "${eventType}"!`
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to dispatch test webhook.' });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleEvent = async (e, eventConfig) => {
    e.stopPropagation();
    setTogglingId(eventConfig.id || eventConfig.event_type);
    setFeedback({ type: '', message: '' });

    try {
      const nextActive = !eventConfig.is_active;
      await apiClient.patch(
        API_ENDPOINTS.PROJECTS.EVENT_UPDATE(project.id, eventConfig.id || eventConfig.event_type),
        { is_active: nextActive }
      );
      setFeedback({
        type: 'success',
        message: `✓ Event "${eventConfig.event_type}" ${nextActive ? 'activated' : 'disabled'}.`,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update event state.' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteEventConfig = async (e, eventConfigId, eventType) => {
    e.stopPropagation();
    if (!window.confirm(`Delete event routing rule "${eventType}"?`)) return;

    setSaving(true);
    try {
      const remainingConfigs = eventConfigs
        .filter((ec) => ec.id !== eventConfigId && ec.event_type !== eventType)
        .map((ec) => ({
          event_type: ec.event_type,
          target_urls: Array.isArray(ec.target_urls) && ec.target_urls.length ? ec.target_urls : (Array.isArray(ec.metadata_json?.urls) && ec.metadata_json.urls.length ? ec.metadata_json.urls : [ec.target_url]),
          payload_keys: ec.payload_keys || ec.metadata_json?.payload_keys || ['event.id'],
          payload_types: ec.payload_types || ec.metadata_json?.payload_types || ['string'],
          is_active: ec.is_active ?? true,
        }));

      await apiClient.patch(API_ENDPOINTS.PROJECTS.UPDATE(project.id), {
        event_configs: remainingConfigs,
      });

      setFeedback({ type: 'success', message: `✓ Event rule "${eventType}" deleted.` });
      if (onRefresh) onRefresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete event rule.' });
    } finally {
      setSaving(false);
    }
  };

  // Generate Sample Pretty JSON string for payload preview
  const generateSampleJson = () => {
    const sample = {};
    eventForm.payload_rules.forEach((r) => {
      if (!r.key) return;
      if (r.type === 'number') sample[r.key] = 149.99;
      else if (r.type === 'boolean') sample[r.key] = true;
      else if (r.type === 'object') sample[r.key] = { id: 'obj_1' };
      else if (r.type === 'array') sample[r.key] = ['item_1', 'item_2'];
      else sample[r.key] = `val_${r.key}_sample`;
    });
    return JSON.stringify(sample, null, 2);
  };

  return (
    <div className="flex flex-col gap-6 font-sans select-none">
      {/* Toast Alert */}
      {feedback.message && (
        <div
          className={`rounded-2xl p-4 text-xs font-semibold flex items-center justify-between border ${
            feedback.type === 'error'
              ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? <AlertTriangle className="h-4 w-4 text-rose-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback({ type: '', message: '' })} className="hover:opacity-75">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Sliders className="h-5 w-5 text-emerald-500" />
            Configured Webhook Events Directory ({eventConfigs.length})
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Click any event row below to open its dedicated configuration page & payload schema inspector
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white shadow-md transition active:scale-95 shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add New Event Rule</span>
        </button>
      </div>

      {/* 🚀 Clean Line-by-Line Stacked Event List (Clickable row to open event detail page!) */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-[#0c0e17]/90 backdrop-blur-md">
        {eventConfigs.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-center text-xs text-zinc-400">
            <Sliders className="h-8 w-8 text-zinc-400 mb-2" />
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">No webhook events configured yet</p>
            <p className="text-zinc-500 mt-1">Click 'Add New Event Rule' above to create your first event hook.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {eventConfigs.map((config) => {
              const urls = Array.isArray(config.target_urls) && config.target_urls.length
                ? config.target_urls
                : (Array.isArray(config.metadata_json?.urls) && config.metadata_json.urls.length
                  ? config.metadata_json.urls
                  : [config.target_url || 'https://api.yourcompany.com/webhooks']);

              const keys = config.payload_keys || config.metadata_json?.payload_keys || ['order_id'];
              const primaryUrl = urls[0] || 'https://api.yourcompany.com/webhooks';

              return (
                <div
                  key={config.id || config.event_type}
                  onClick={() => handleOpenEditModal(config)}
                  className="group relative flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 shadow-sm backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/60 hover:border-emerald-500/50 hover:bg-zinc-100/80 dark:hover:bg-zinc-900/80 transition-all duration-150 cursor-pointer"
                >
                  {/* Left: Event Type Name & Active Status ONLY */}
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs shrink-0">
                      ⚡
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-extrabold text-zinc-900 dark:text-white group-hover:text-emerald-500 transition">
                        {config.event_type}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        config.is_active ?? true
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        {config.is_active ?? true ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center justify-end gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleToggleEvent(e, config)}
                      className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        config.is_active ?? true
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                      }`}
                    >
                      {config.is_active ?? true ? 'Disable' : 'Enable'}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteEventConfig(e, config.id, config.event_type)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition"
                      title="Delete Event Rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <div className="flex items-center gap-1 text-xs font-bold text-indigo-500 group-hover:translate-x-1 transition-transform pl-1">
                      <span>Configure</span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 🛠️ DEDICATED EVENT CONFIGURATION & SCHEMA PAGE / MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 space-y-6 shadow-2xl custom-scrollbar">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-emerald-500" />
                  {editingConfigId ? `Event Configuration Page: "${eventForm.event_type}"` : 'Configure New Webhook Event Rule'}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">Configure target URLs, custom payload keys, and sample schema JSON</p>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEventConfig} className="space-y-6 text-xs font-sans">
              {/* Event Type Name */}
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Event Type Name * (e.g. order.created, user.signup, payment.succeeded)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. order.created"
                  value={eventForm.event_type}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, event_type: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-mono font-bold"
                />
              </div>

              {/* 🌐 MULTIPLE TARGET ENDPOINT URLS */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Globe className="h-4 w-4 text-emerald-500" />
                    Target Destination Endpoint URLs ({eventForm.target_urls.length})
                  </label>

                  <button
                    type="button"
                    onClick={handleAddUrl}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Target URL</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {eventForm.target_urls.map((url, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="url"
                        required
                        placeholder="https://api.yourcompany.com/webhooks"
                        value={url}
                        onChange={(e) => handleUpdateUrl(idx, e.target.value)}
                        className="flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 font-mono text-emerald-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-emerald-400 outline-none focus:border-emerald-500"
                      />
                      {eventForm.target_urls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveUrl(idx)}
                          className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition"
                          title="Remove URL"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 💻 MULTIPLE PAYLOAD VALIDATION KEYS & TYPES */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Code2 className="h-4 w-4 text-indigo-400" />
                    Expected Payload Validation Keys ({eventForm.payload_rules.length})
                  </label>

                  <button
                    type="button"
                    onClick={handleAddPayloadRule}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Schema Field</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {eventForm.payload_rules.map((rule, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Key Name (e.g. order_id)"
                        value={rule.key}
                        onChange={(e) => handleUpdatePayloadRule(idx, 'key', e.target.value)}
                        className="flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 font-mono text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                      />

                      <select
                        value={rule.type}
                        onChange={(e) => handleUpdatePayloadRule(idx, 'type', e.target.value)}
                        className="w-32 rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="object">object</option>
                        <option value="array">array</option>
                      </select>

                      {eventForm.payload_rules.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePayloadRule(idx)}
                          className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition"
                          title="Remove Key Field"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Event Info Status Card */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 text-xs font-mono">
                <div className="flex items-center gap-3">
                  <span className="font-extrabold text-zinc-900 dark:text-white">{eventForm.event_type || 'order.done'}</span>
                  <span className="text-zinc-400">•</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">Node #{project?.id || '10'}</span>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Active
                </span>
              </div>

              {/* Action Buttons: Simulate Webhook + Cancel & Save/Update */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <button
                  type="button"
                  disabled={testingId === eventForm.event_type}
                  onClick={() => handleTestDispatch(eventForm.event_type || 'order.done', eventForm.target_urls[0])}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-4 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-400 transition active:scale-95 shadow-sm"
                >
                  <Send className={`h-4 w-4 ${testingId === eventForm.event_type ? 'animate-pulse' : ''}`} />
                  <span>Simulate Webhook</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-semibold text-zinc-600 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-white transition"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : (editingConfigId ? 'Update Event Configuration' : 'Save Event Rule')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
