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
  ShieldCheck 
} from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import { useAuth } from '../context/AuthContext';
import apiClient from '@/api/client';

export default function SettingsPage() {
  const { user } = useAuth();
  
  // Feedback state
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState(false);

  // Company Profile Form State
  const [profileForm, setProfileForm] = useState({
    companyName: user?.company_name || '',
    supportEmail: user?.email || '',
    timezone: 'UTC',
    ingressRegion: '',
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
      await apiClient.put('/v1/companies/me', {
        company_name: profileForm.companyName,
        support_email: profileForm.supportEmail,
        description: profileForm.description,
        timezone: profileForm.timezone,
        ingress_region: profileForm.ingressRegion,
      });
      setFeedback({ type: 'success', message: '✓ Company details updated successfully!' });
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
      await apiClient.post('/v1/auth/change_password', {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword
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
      await apiClient.post('/v1/companies/archive');
      setShowSoftDeleteModal(false);
      setFeedback({ type: 'success', message: '✓ Organization archived and ingress routes set to read-only mode.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to archive organization.' });
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
      await apiClient.delete('/v1/companies/me');
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
      <div className="flex flex-col gap-8 font-sans text-zinc-900 dark:text-zinc-100 w-full max-w-5xl select-none pb-12">
        
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

        {/* 🏢 SECTION 1: COMPANY PROFILE & DETAILS */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-500" />
                Company Profile & General Details
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Manage organization identity, support email, and primary ingress region
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
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

            <div className="space-y-2">
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Primary Ingress Region
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
                Default System Timezone
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

            <div className="md:col-span-2 space-y-2">
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Short Organization Note / Description
              </label>
              <input
                type="text"
                value={profileForm.description}
                onChange={(e) => setProfileForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-xs font-bold text-white shadow-md transition active:scale-95 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{savingProfile ? 'Saving...' : 'Save Company Details'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* 🔐 SECTION 2: SECURITY & CHANGE PASSWORD */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                <Lock className="h-5 w-5 text-emerald-500" />
                Security & Password Management
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Update account authentication password and security credentials
              </p>
            </div>
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
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-xs font-bold text-white shadow-md transition active:scale-95 disabled:opacity-50"
              >
                <Lock className="h-4 w-4" />
                <span>{savingPassword ? 'Updating...' : 'Update Password'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* ⚠️ SECTION 3: DATA DELETION GOVERNANCE (SOFT DELETE vs HARD DELETE) */}
        <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 space-y-6 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-rose-500/20 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-500" />
                Organization Data Governance & Deletion Controls
              </h3>
              <p className="text-xs text-rose-400/80 mt-0.5">
                Soft Delete (Archive) or Hard Delete (Permanent Purge) organization resources
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            {/* Soft Delete / Archive Card */}
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
                  Disables active webhook ingress endpoints and sets organization routes to read-only mode while preserving historical logs and backups for recovery.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowSoftDeleteModal(true)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/20 hover:bg-amber-500/30 px-4 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-300 transition active:scale-95 mt-2"
              >
                <Archive className="h-4 w-4" />
                <span>Archive Organization (Soft Delete)</span>
              </button>
            </div>

            {/* Hard Delete / Permanent Purge Card */}
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-rose-600 dark:text-rose-400 text-sm flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Hard Delete (Permanent Data Purge)
                  </h4>
                  <span className="text-[10px] bg-rose-500/20 text-rose-600 dark:text-rose-300 font-bold px-2 py-0.5 rounded">
                    Irreversible 🚨
                  </span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                  Permanently destroys all company projects, webhook delivery logs, dead letter queue items, API keys, and secret credentials.
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
        </section>

      </div>

      {/* ⚠️ Soft Delete / Archive Confirmation Modal */}
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
              Are you sure you want to soft delete / archive <strong className="text-white">{profileForm.companyName}</strong>? All webhook ingress processing will be paused, but logs and project data will be preserved.
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

      {/* 🚨 Hard Delete / Permanent Purge Modal */}
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
                disabled={deletingOrg}
                onClick={handleHardDelete}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2 text-xs font-bold text-white shadow-lg transition disabled:opacity-50"
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
