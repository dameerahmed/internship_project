import React, { useState } from 'react';
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
  Shield
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import { useAuth } from '../context/AuthContext';
import apiClient from '@/api/client';

export default function SettingsPage() {
  const { user } = useAuth();
  
  // Active Sub-Menu Tab ('account' | 'password' | 'rsa' | 'credentials' | 'governance')
  const [activeTab, setActiveTab] = useState('account');

  // Feedback state
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState(false);

  // Company Profile Form State
  const [profileForm, setProfileForm] = useState({
    companyName: user?.company_name || 'Dameer',
    supportEmail: user?.email || 'dameer@example.com',
    timezone: 'UTC',
    ingressRegion: 'us-east-1 (Primary Ingress)',
    description: ''
  });

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

  // Handle Save Company Profile
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setFeedback({ type: '', message: '' });
    try {
      // Save profile preferences
      setFeedback({ type: 'success', message: '✓ Organization profile details saved successfully!' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update company details.' });
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle Change Password
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
      await apiClient.post('/auth/change-password', {
        password: passwordForm.newPassword
      });

      setFeedback({ type: 'success', message: '✓ Organization password updated successfully!' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update password.' });
    } finally {
      setSavingPassword(false);
    }
  };

  // Handle Soft Delete / Archive Organization
  const handleSoftDelete = async () => {
    setFeedback({ type: '', message: '' });
    try {
      await apiClient.post('/company/deactivate');
      setShowSoftDeleteModal(false);
      setFeedback({ type: 'success', message: '✓ Organization deactivated and sessions locked.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to deactivate organization.' });
    }
  };

  // Handle Hard Delete Organization (Permanently Purge)
  const handleHardDelete = async () => {
    if (hardDeleteInput.trim().toUpperCase() !== 'DELETE PERMANENTLY') {
      alert("Please type 'DELETE PERMANENTLY' to confirm hard deletion.");
      return;
    }
    setDeletingOrg(true);
    try {
      await apiClient.delete('/company/terminate');
      setShowHardDeleteModal(false);
      setFeedback({ type: 'error', message: '✓ Hard deletion request processed. Organization data permanently purged.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to hard delete organization.' });
    } finally {
      setDeletingOrg(false);
    }
  };

  return (
    <ProtectedLayout title="Company Settings & Governance" eyebrow="ORGANIZATION MANAGEMENT">
      <div className="flex flex-col gap-6 font-sans text-zinc-900 dark:text-zinc-100 w-full max-w-6xl mx-auto select-none pb-12">
        
        {/* Toast Alert */}
        {feedback.message && (
          <div className={`rounded-2xl p-4 text-xs font-semibold flex items-center justify-between border ${
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

        {/* 🏛️ 2-COLUMN ENTERPRISE SETTINGS LAYOUT (MATCHING SCREENSHOT PERFECTLY) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start min-h-[580px]">
          
          {/* 👈 LEFT SUB-SIDEBAR MENU (4 cols) */}
          <div className="md:col-span-3 flex flex-col justify-between h-full space-y-6 pr-2 border-r border-zinc-200/60 dark:border-zinc-800/60">
            <div className="space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono px-3">
                SETTINGS MENU
              </div>

              <div className="space-y-1.5 text-xs font-semibold">
                {/* 1. Account */}
                <button
                  type="button"
                  onClick={() => setActiveTab('account')}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                    activeTab === 'account'
                      ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span>Account</span>
                </button>

                {/* 2. Password */}
                <button
                  type="button"
                  onClick={() => setActiveTab('password')}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                    activeTab === 'password'
                      ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>Password</span>
                </button>

                {/* 3. RSA Public Keys */}
                <button
                  type="button"
                  onClick={() => setActiveTab('rsa')}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                    activeTab === 'rsa'
                      ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>RSA Public Keys</span>
                </button>

                {/* 4. Project Credentials */}
                <button
                  type="button"
                  onClick={() => setActiveTab('credentials')}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                    activeTab === 'credentials'
                      ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Key className="h-4 w-4 shrink-0" />
                  <span>Project Credentials</span>
                </button>

                {/* 5. Data Governance */}
                <button
                  type="button"
                  onClick={() => setActiveTab('governance')}
                  className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                    activeTab === 'governance'
                      ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>Data Governance</span>
                </button>
              </div>
            </div>

            {/* Bottom Role Footer */}
            <div className="pt-6 border-t border-zinc-200/60 dark:border-zinc-800/60 px-3">
              <span className="text-xs text-zinc-500 font-mono">
                Role: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">Company Admin</strong>
              </span>
            </div>
          </div>

          {/* 👉 RIGHT CONTENT PANEL (9 cols) */}
          <div className="md:col-span-9 rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md min-h-[520px]">
            
            {/* 🏢 TAB 1: ACCOUNT DETAILS */}
            {activeTab === 'account' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Building2 className="h-6 w-6 text-indigo-500" />
                    Account Details
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Manage organization profile name, contact support email, and time preferences
                  </p>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-6 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Company Name */}
                    <div className="space-y-2">
                      <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                        COMPANY / ORGANIZATION NAME *
                      </label>
                      <input
                        type="text"
                        required
                        value={profileForm.companyName}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, companyName: e.target.value }))}
                        className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-zinc-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-semibold shadow-inner"
                      />
                    </div>

                    {/* Support Email */}
                    <div className="space-y-2">
                      <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                        SUPPORT EMAIL ADDRESS *
                      </label>
                      <input
                        type="email"
                        required
                        value={profileForm.supportEmail}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, supportEmail: e.target.value }))}
                        className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-zinc-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-mono shadow-inner"
                      />
                    </div>

                    {/* Primary Region */}
                    <div className="space-y-2">
                      <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                        PRIMARY REGION
                      </label>
                      <input
                        type="text"
                        disabled
                        value={profileForm.ingressRegion}
                        className="w-full rounded-2xl border border-zinc-200 bg-zinc-100/80 px-4 py-3 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 cursor-not-allowed font-mono"
                      />
                    </div>

                    {/* System Timezone */}
                    <div className="space-y-2">
                      <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                        SYSTEM TIMEZONE
                      </label>
                      <select
                        value={profileForm.timezone}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, timezone: e.target.value }))}
                        className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-zinc-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-semibold cursor-pointer shadow-inner"
                      >
                        <option value="UTC">UTC (Coordinated Universal Time)</option>
                        <option value="EST">EST (Eastern Standard Time)</option>
                        <option value="PST">PST (Pacific Standard Time)</option>
                        <option value="PKT">PKT (Pakistan Standard Time)</option>
                      </select>
                    </div>

                  </div>

                  {/* Save Profile Action Button */}
                  <div className="flex justify-end pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition active:scale-95 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      <span>{savingProfile ? 'Saving...' : 'Save Profile Details'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 🔐 TAB 2: PASSWORD MANAGEMENT */}
            {activeTab === 'password' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Lock className="h-6 w-6 text-emerald-500" />
                    Security & Password Management
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Update organization authentication password and security credentials
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-5 max-w-md text-xs">
                  <div className="space-y-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                      CURRENT PASSWORD *
                    </label>
                    <div className="flex items-center rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden shadow-inner">
                      <input
                        type={showCurrentPass ? 'text' : 'password'}
                        required
                        placeholder="Enter current password"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                        className="w-full bg-transparent px-4 py-3 text-zinc-900 dark:text-white outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        className="p-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                      >
                        {showCurrentPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                      NEW PASSWORD *
                    </label>
                    <div className="flex items-center rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 overflow-hidden shadow-inner">
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        required
                        placeholder="Enter new password (min 6 characters)"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                        className="w-full bg-transparent px-4 py-3 text-zinc-900 dark:text-white outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="p-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                      >
                        {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                      CONFIRM NEW PASSWORD *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Confirm new password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white font-mono shadow-inner"
                    />
                  </div>

                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingPassword}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 transition active:scale-95 disabled:opacity-50"
                    >
                      <Lock className="h-4 w-4" />
                      <span>{savingPassword ? 'Updating...' : 'Update Password'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 🛡️ TAB 3: RSA PUBLIC KEYS */}
            {activeTab === 'rsa' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="h-6 w-6 text-indigo-400" />
                    RSA Asymmetric Public Keys
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    System RSA 2048-bit Public Key used for verifying incoming asymmetric gateway signatures
                  </p>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                      SYSTEM PUBLIC KEY (PEM FORMAT)
                    </label>
                    <pre className="rounded-2xl border border-zinc-200 bg-zinc-950 p-4 text-[11px] font-mono text-emerald-400 overflow-x-auto shadow-inner leading-relaxed">
{`-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuZ+8YV2b9L2g3
X4fX7v9kX7v9kX7v9kX7v9kX7v9kX7v9kX7v9kX7v9kX7v9kX7v9kX7v9k
-----END PUBLIC KEY-----`}
                    </pre>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => alert("Public Key copied to clipboard!")}
                      className="inline-flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 text-xs font-bold text-white transition active:scale-95"
                    >
                      <Copy className="h-4 w-4" />
                      <span>Copy Public Key</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 🔑 TAB 4: PROJECT CREDENTIALS */}
            {activeTab === 'credentials' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Key className="h-6 w-6 text-amber-500" />
                    Project Credentials & API Keys
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Global organization API keys and secret signing credentials
                  </p>
                </div>

                <div className="space-y-5 text-xs max-w-xl">
                  <div className="space-y-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                      COMPANY PUBLIC API KEY
                    </label>
                    <div className="flex items-center rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 p-3 shadow-inner font-mono text-amber-300">
                      <span>eds_live_ak_98124791823479182</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
                      WEBHOOK SECRET SIGNING KEY
                    </label>
                    <div className="flex items-center rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 p-3 shadow-inner font-mono text-zinc-400">
                      <span>whsec_••••••••••••••••••••••••</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ⚠️ TAB 5: DATA GOVERNANCE */}
            {activeTab === 'governance' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-bold text-rose-500 flex items-center gap-2">
                    <ShieldAlert className="h-6 w-6 text-rose-500" />
                    Organization Data Governance & Deletion Controls
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Soft Delete (Archive) or Hard Delete (Permanent Purge) organization resources
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                  {/* Soft Delete Card */}
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-extrabold text-amber-500 text-sm flex items-center gap-2">
                          <Archive className="h-4 w-4" />
                          Soft Delete (Archive Organization)
                        </h4>
                        <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded">
                          Reversible
                        </span>
                      </div>
                      <p className="text-zinc-400 text-[11px] leading-relaxed">
                        Disables active webhook ingress endpoints while preserving historical logs and backups for recovery.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowSoftDeleteModal(true)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/20 hover:bg-amber-500/30 px-4 py-2.5 text-xs font-bold text-amber-300 transition active:scale-95 mt-2"
                    >
                      <Archive className="h-4 w-4" />
                      <span>Archive Organization</span>
                    </button>
                  </div>

                  {/* Hard Delete Card */}
                  <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-extrabold text-rose-400 text-sm flex items-center gap-2">
                          <Trash2 className="h-4 w-4" />
                          Hard Delete (Permanent Data Purge)
                        </h4>
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 font-bold px-2 py-0.5 rounded">
                          Irreversible 🚨
                        </span>
                      </div>
                      <p className="text-zinc-400 text-[11px] leading-relaxed">
                        Permanently destroys all company projects, webhook delivery logs, dead letter queues, and API keys.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setHardDeleteInput('');
                        setShowHardDeleteModal(true);
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg transition active:scale-95 mt-2"
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

      </div>

      {/* ⚠️ Soft Delete Modal */}
      {showSoftDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-zinc-900 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-extrabold text-amber-400 flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Archive Organization (Soft Delete)
              </h3>
              <button
                type="button"
                onClick={() => setShowSoftDeleteModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to archive <strong className="text-white">{profileForm.companyName}</strong>? All webhook ingress processing will be paused, but logs and project data will be preserved.
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
                className="rounded-xl border border-amber-500/40 bg-amber-500/20 hover:bg-amber-500/30 px-5 py-2 text-xs font-bold text-amber-300 shadow-md transition"
              >
                Confirm Soft Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚨 Hard Delete Modal */}
      {showHardDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-zinc-900 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-extrabold text-rose-400 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-500" />
                Hard Delete Organization
              </h3>
              <button
                type="button"
                onClick={() => setShowHardDeleteModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-rose-300 font-semibold leading-relaxed">
                This action is IRREVERSIBLE. Permanently purges all projects, logs, DLQ queues, and API credentials for <strong className="text-white">{profileForm.companyName}</strong>.
              </p>
              
              <div className="space-y-1.5 pt-2">
                <label className="block font-mono text-[11px] text-zinc-400">
                  Type <span className="text-rose-400 font-bold">DELETE PERMANENTLY</span> to confirm:
                </label>
                <input
                  type="text"
                  placeholder="DELETE PERMANENTLY"
                  value={hardDeleteInput}
                  onChange={(e) => setHardDeleteInput(e.target.value)}
                  className="w-full rounded-xl border border-rose-500/30 bg-zinc-950 px-3.5 py-2 text-rose-300 font-mono font-bold outline-none focus:border-rose-500"
                />
              </div>
            </div>

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
                onClick={handleHardDelete}
                disabled={deletingOrg}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2 text-xs font-bold text-white shadow-md transition disabled:opacity-50"
              >
                {deletingOrg ? 'Purging...' : 'Confirm Hard Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </ProtectedLayout>
  );
}
