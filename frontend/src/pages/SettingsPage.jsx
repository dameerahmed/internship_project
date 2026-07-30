import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Lock, 
  ShieldAlert, 
  Trash2, 
  Archive, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Save, 
  Key, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  Code2, 
  ShieldCheck,
  User,
  Globe,
  FolderKanban,
  RefreshCw,
  Search,
  Bell,
  SlidersHorizontal
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import { useAuth } from '../context/AuthContext';
import apiClient from '@/api/client';

export default function SettingsPage() {
  const { user } = useAuth();
  
  // Active Sub-Navigation Tab: 'account' | 'password' | 'rsa' | 'project' | 'governance'
  const [activeTab, setActiveTab] = useState('account');

  // Feedback state
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState(false);

  // RSA Public Key state
  const [rsaPublicKey, setRsaPublicKey] = useState('');
  const [loadingRsaKey, setLoadingRsaKey] = useState(false);
  const [copiedRsaKey, setCopiedRsaKey] = useState(false);

  // Company Profile Form State
  const [profileForm, setProfileForm] = useState({
    companyName: user?.company_name || '',
    supportEmail: user?.email || '',
    timezone: 'UTC',
    ingressRegion: 'us-east-1 (Primary Ingress)',
    description: ''
  });

  // Project Credential State (For Project Keys tab)
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectKeys, setProjectKeys] = useState(null);
  const [loadingProjectKeys, setLoadingProjectKeys] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [copiedApiKey, setCopiedApiKey] = useState(false);
  const [copiedSecretKey, setCopiedSecretKey] = useState(false);
  const [targetUrlInput, setTargetUrlInput] = useState('');
  const [savingTargetUrl, setSavingTargetUrl] = useState(false);

  // Change Password Form State
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  // Archive / Soft Delete & Hard Delete Confirmation Modals
  const [showSoftDeleteModal, setShowSoftDeleteModal] = useState(false);
  const [showHardDeleteModal, setShowHardDeleteModal] = useState(false);
  const [hardDeleteInput, setHardDeleteInput] = useState('');

  // 1. Load Company Profile & RSA Key
  useEffect(() => {
    const fetchCompanyData = async () => {
      setLoadingRsaKey(true);
      try {
        const { data } = await apiClient.get('/v1/companies/me');
        if (data?.rsa_public_key) {
          setRsaPublicKey(data.rsa_public_key);
        }
        if (data?.company_name || data?.name) {
          setProfileForm((prev) => ({
            ...prev,
            companyName: data.company_name || data.name || prev.companyName,
            supportEmail: data.support_email || data.email || prev.supportEmail,
          }));
        }
      } catch (err) {
        console.warn('Failed to fetch company profile/RSA key:', err);
      } finally {
        setLoadingRsaKey(false);
      }
    };
    fetchCompanyData();
  }, []);

  // 2. Fetch Projects for Project Keys Tab
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const { data } = await apiClient.get('/v1/projects');
        const list = Array.isArray(data) ? data : [];
        setProjects(list);
        if (list.length > 0 && !selectedProjectId) {
          setSelectedProjectId(list[0].id);
        }
      } catch (err) {
        console.warn('Failed to fetch projects:', err);
      }
    };
    fetchProjects();
  }, []);

  // 3. Fetch Selected Project Credentials
  useEffect(() => {
    if (!selectedProjectId) return;
    const fetchKeys = async () => {
      setLoadingProjectKeys(true);
      try {
        const { data } = await apiClient.get(`/v1/projects/refresh_keys/${selectedProjectId}`);
        setProjectKeys(data);
        if (data?.target_url) setTargetUrlInput(data.target_url);
      } catch (err) {
        console.warn('Failed to fetch project keys:', err);
      } finally {
        setLoadingProjectKeys(false);
      }
    };
    fetchKeys();
  }, [selectedProjectId]);

  const handleCopyRsaKey = async () => {
    if (!rsaPublicKey) return;
    try {
      await navigator.clipboard.writeText(rsaPublicKey);
      setCopiedRsaKey(true);
      setTimeout(() => setCopiedRsaKey(false), 2000);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setFeedback({ type: '', message: '' });
    try {
      await apiClient.put('/v1/companies/me', {
        company_name: profileForm.companyName,
        support_email: profileForm.supportEmail,
        description: profileForm.description,
        timezone: profileForm.timezone,
      });
      setFeedback({ type: 'success', message: '✓ Company profile updated successfully!' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update company profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setFeedback({ type: 'error', message: 'New password and confirmation password do not match.' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setFeedback({ type: 'error', message: 'Password must be at least 6 characters long.' });
      return;
    }

    setSavingPassword(true);
    setFeedback({ type: '', message: '' });
    try {
      await apiClient.post('/v1/auth/change_password', {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword
      });

      setFeedback({ type: 'success', message: '✓ Account password updated successfully!' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update password.' });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSoftDelete = async () => {
    setFeedback({ type: '', message: '' });
    try {
      await apiClient.post('/v1/companies/archive');
      setShowSoftDeleteModal(false);
      setFeedback({ type: 'success', message: '✓ Organization archived.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to archive organization.' });
    }
  };

  const handleHardDelete = async () => {
    if (hardDeleteInput.trim().toUpperCase() !== 'DELETE PERMANENTLY') {
      alert("Please type 'DELETE PERMANENTLY' to confirm hard deletion.");
      return;
    }
    setDeletingOrg(true);
    try {
      await apiClient.delete('/v1/companies/me');
      setShowHardDeleteModal(false);
      setFeedback({ type: 'error', message: '✓ Organization data permanently purged.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete organization.' });
    } finally {
      setDeletingOrg(false);
    }
  };

  const subNavItems = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'password', label: 'Password', icon: Lock },
    { id: 'rsa', label: 'RSA Public Keys', icon: ShieldCheck },
    { id: 'project', label: 'Project Credentials', icon: Key },
    { id: 'governance', label: 'Data Governance', icon: ShieldAlert },
  ];

  return (
    <ProtectedLayout title="Settings" eyebrow="ACCOUNT & GOVERNANCE">
      
      {/* 🖼️ DASHBOARD UI KIT 2.0 TWO-COLUMN SUB-NAVIGATION LAYOUT */}
      <div className="flex flex-col lg:flex-row w-full max-w-6xl min-h-[620px] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0d1017] shadow-xl overflow-hidden font-sans select-none">
        
        {/* 📋 SUB-NAVIGATION SIDEBAR MENU (Left Column matching Dashboard UI Kit 2.0) */}
        <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-[#0a0c12] p-4 flex flex-col gap-1 shrink-0">
          <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono">
            SETTINGS MENU
          </div>

          {subNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md font-bold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-white' : 'text-zinc-400'} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="mt-auto pt-6 border-t border-zinc-200 dark:border-zinc-800/60">
            <div className="px-3 text-[11px] text-zinc-400 font-mono">
              Role: <strong className="text-indigo-400">{user?.role || 'Company Admin'}</strong>
            </div>
          </div>
        </div>

        {/* 📄 MAIN CONTENT PANEL (Right Column) */}
        <div className="flex-1 flex flex-col p-6 lg:p-8 bg-white dark:bg-[#0d1017] overflow-y-auto">
          
          {/* Top Feedback Alert */}
          {feedback.message && (
            <div className={`mb-6 rounded-xl p-4 text-xs font-semibold flex items-center justify-between border ${
              feedback.type === 'error'
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
            }`}>
              <div className="flex items-center gap-2">
                {feedback.type === 'error' ? <AlertTriangle className="h-4 w-4 text-rose-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                <span>{feedback.message}</span>
              </div>
              <button type="button" onClick={() => setFeedback({ type: '', message: '' })} className="hover:opacity-75">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* TAB 1: ACCOUNT / COMPANY PROFILE */}
          {activeTab === 'account' && (
            <div className="space-y-6">
              <div className="border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
                <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-500" />
                  Account Details
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Manage organization profile name, contact support email, and time preferences
                </p>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-5 max-w-2xl text-xs">
                <div className="space-y-2">
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    Company / Organization Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.companyName}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, companyName: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-semibold"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    Support Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={profileForm.supportEmail}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, supportEmail: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                      Primary Region
                    </label>
                    <input
                      type="text"
                      disabled
                      value={profileForm.ingressRegion}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-2.5 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 cursor-not-allowed font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                      System Timezone
                    </label>
                    <select
                      value={profileForm.timezone}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, timezone: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-semibold"
                    >
                      <option value="UTC">UTC (Coordinated Universal Time)</option>
                      <option value="EST">EST (Eastern Standard Time)</option>
                      <option value="PST">PST (Pacific Standard Time)</option>
                      <option value="PKT">PKT (Pakistan Standard Time)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    <span>{savingProfile ? 'Saving...' : 'Save Profile Details'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: PASSWORD MANAGEMENT */}
          {activeTab === 'password' && (
            <div className="space-y-6">
              <div className="border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
                <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Lock className="h-5 w-5 text-emerald-500" />
                  Password Management
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Update account authentication password and security credentials
                </p>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md text-xs">
                <div className="space-y-1.5">
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    Current Password *
                  </label>
                  <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
                    <input
                      type={showCurrentPass ? 'text' : 'password'}
                      required
                      placeholder="Enter current password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="w-full bg-transparent px-4 py-2.5 text-zinc-900 dark:text-white outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="p-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                    >
                      {showCurrentPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    New Password *
                  </label>
                  <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden">
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      required
                      placeholder="Enter new password (min 6 characters)"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                      className="w-full bg-transparent px-4 py-2.5 text-zinc-900 dark:text-white outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="p-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                    >
                      {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    Confirm New Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Confirm new password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-mono"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50"
                  >
                    <Lock className="h-4 w-4" />
                    <span>{savingPassword ? 'Updating...' : 'Update Password'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: RSA PUBLIC KEYS */}
          {activeTab === 'rsa' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
                <div>
                  <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-indigo-500" />
                    Cryptographic RSA Public Key
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Share this RSA Public Key with external receivers to verify asymmetric digital signatures
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCopyRsaKey}
                  disabled={!rsaPublicKey || loadingRsaKey}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 px-4 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 transition active:scale-95 disabled:opacity-50"
                >
                  {copiedRsaKey ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedRsaKey ? 'Copied Key!' : 'Copy Public Key'}</span>
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    RSA 2048-bit Public Key (PEM Format)
                  </label>
                  <span className="font-mono text-[11px] text-zinc-400">Algorithm: RSA-SHA256</span>
                </div>
                <textarea
                  readOnly
                  rows={8}
                  value={loadingRsaKey ? 'Loading RSA Public Key…' : rsaPublicKey || 'No RSA Public Key provisioned.'}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-950 p-4 font-mono text-xs text-emerald-400 border-zinc-800 outline-none select-all resize-none shadow-inner leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 4: PROJECT CREDENTIALS */}
          {activeTab === 'project' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
                <div>
                  <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Key className="h-5 w-5 text-indigo-500" />
                    Project Credentials & Keys
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Manage project API keys, HMAC secret keys, and target endpoint receivers
                  </p>
                </div>

                {projects.length > 0 && (
                  <select
                    value={selectedProjectId || ''}
                    onChange={(e) => setSelectedProjectId(Number(e.target.value))}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-3.5 py-2 text-xs font-bold text-zinc-900 dark:text-white outline-none"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (#{p.id})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-5 text-xs">
                {/* Target URL */}
                <div className="space-y-2">
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    Target Endpoint URL
                  </label>
                  <input
                    type="url"
                    readOnly
                    value={targetUrlInput || 'https://api.yourdomain.com/webhook'}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-mono"
                  />
                </div>

                {/* Secret Key */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                      HMAC Secret Key (X-Hub-Signature-256)
                    </label>
                    <span className="font-mono text-[11px] text-emerald-400 font-bold">256-bit Hex</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-4 py-2.5 font-mono text-emerald-400">
                      <input
                        type={showSecretKey ? 'text' : 'password'}
                        readOnly
                        value={projectKeys?.secret_key || 'whsec_demo_secret_key'}
                        className="w-full bg-transparent outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 text-zinc-400 hover:text-white"
                    >
                      {showSecretKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                      Client API Key (X-Api-Key)
                    </label>
                    <span className="font-mono text-[11px] text-indigo-400 font-bold">Ingress Key</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 px-4 py-2.5 font-mono text-indigo-400">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        readOnly
                        value={projectKeys?.api_key || `eds_pk_live_${selectedProjectId}`}
                        className="w-full bg-transparent outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 text-zinc-400 hover:text-white"
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 5: DATA GOVERNANCE */}
          {activeTab === 'governance' && (
            <div className="space-y-6">
              <div className="border-b border-rose-500/20 pb-4">
                <h2 className="text-xl font-extrabold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-500" />
                  Organization Data Governance & Deletion Controls
                </h2>
                <p className="text-xs text-rose-400/80 mt-1">
                  Soft Delete (Archive) or Hard Delete (Permanent Purge) organization resources
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                {/* Soft Delete */}
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-amber-600 dark:text-amber-400 text-sm flex items-center gap-2">
                        <Archive className="h-4 w-4" />
                        Soft Delete (Archive Organization)
                      </h4>
                      <span className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold px-2 py-0.5 rounded">
                        Reversible
                      </span>
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                      Disables active webhook ingress endpoints while preserving historical logs and backups for recovery.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSoftDeleteModal(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/20 hover:bg-amber-500/30 px-4 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-300 transition active:scale-95"
                  >
                    <Archive className="h-4 w-4" />
                    <span>Archive Organization</span>
                  </button>
                </div>

                {/* Hard Delete */}
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-rose-600 dark:text-rose-400 text-sm flex items-center gap-2">
                        <Trash2 className="h-4 w-4" />
                        Hard Delete (Permanent Data Purge)
                      </h4>
                      <span className="text-[10px] bg-rose-500/20 text-rose-600 dark:text-rose-300 font-bold px-2 py-0.5 rounded">
                        Irreversible
                      </span>
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                      Permanently destroys all company projects, delivery logs, DLQ items, API keys, and secret credentials.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setHardDeleteInput('');
                      setShowHardDeleteModal(true);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg transition active:scale-95"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Hard Delete Organization</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Modals */}
      {showSoftDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-zinc-900 p-6 space-y-5 shadow-2xl">
            <h3 className="text-base font-extrabold text-amber-400 flex items-center gap-2">
              <Archive className="h-5 w-5" />
              Archive Organization (Soft Delete)
            </h3>
            <p className="text-xs text-zinc-300">
              Are you sure you want to soft delete / archive <strong className="text-white">{profileForm.companyName}</strong>?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSoftDeleteModal(false)}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSoftDelete}
                className="rounded-xl border border-amber-500/40 bg-amber-500/20 hover:bg-amber-500/30 px-5 py-2 text-xs font-bold text-amber-300"
              >
                Confirm Soft Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showHardDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-zinc-900 p-6 space-y-5 shadow-2xl">
            <h3 className="text-base font-extrabold text-rose-400 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-500" />
              Hard Delete Organization
            </h3>
            <p className="text-xs text-rose-300">
              Type <strong className="text-white">DELETE PERMANENTLY</strong> to confirm:
            </p>
            <input
              type="text"
              placeholder="DELETE PERMANENTLY"
              value={hardDeleteInput}
              onChange={(e) => setHardDeleteInput(e.target.value)}
              className="w-full rounded-xl border border-rose-500/30 bg-zinc-950 px-3.5 py-2 text-rose-300 font-mono font-bold outline-none"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowHardDeleteModal(false)}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingOrg}
                onClick={handleHardDelete}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2 text-xs font-bold text-white shadow-lg disabled:opacity-50"
              >
                {deletingOrg ? 'Purging Data...' : 'Confirm Hard Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </ProtectedLayout>
  );
}
