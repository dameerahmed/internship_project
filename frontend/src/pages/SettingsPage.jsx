import { useMemo, useState } from 'react';
import { KeyRound, Lock, ShieldAlert } from 'lucide-react';
import ProtectedLayout from '../components/ProtectedLayout';
import { useAuth } from '../context/AuthContext';
import apiClient from '@/api/client';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmations, setConfirmations] = useState({ soft: false, hard: false });

  const accountSummary = useMemo(() => [
    ['Workspace', user?.company_name || '—'],
    ['Email', user?.email || '—'],
    ['Session', 'Active'],
  ], [user]);

  const handleDeactivate = async () => {
    if (!confirmations.soft) {
      setConfirmations((value) => ({ ...value, soft: true }));
      return;
    }

    setBusy(true);
    setError('');
    setStatus('');
    try {
      await apiClient.post('/company/deactivate');
      setStatus('Workspace locked. Access is suspended until the tenant is re-enabled.');
    } catch (err) {
      setError(err.message || 'Unable to deactivate account.');
    } finally {
      setBusy(false);
    }
  };

  const handleTerminate = async () => {
    if (!confirmations.hard) {
      setConfirmations((value) => ({ ...value, hard: true }));
      return;
    }

    if (!window.confirm('This permanently deletes the workspace and its projects. Continue?')) {
      return;
    }

    setBusy(true);
    setError('');
    setStatus('');
    try {
      await apiClient.delete('/company/terminate');
      await logout();
      window.location.assign('/login');
    } catch (err) {
      setError(err.message || 'Unable to terminate account.');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    if (password.length < 8 || password !== confirmPassword) {
      setError('Use a matching password of at least 8 characters.');
      return;
    }

    setBusy(true);
    setError('');
    setStatus('');
    try {
      await apiClient.post('/auth/change-password', { password });
      setStatus('Password changed successfully.');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Unable to change password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtectedLayout title="Settings & Security" eyebrow="Governance">
      <section className="rounded-[28px] border border-zinc-200/70 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-indigo-500">Company profile</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Protect the workspace with secure lifecycle controls.</h2>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-400">Only the required governance tasks remain visible.</div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {accountSummary.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500 dark:text-zinc-400">{label}</p>
              <p className="mt-2 font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[28px] border border-zinc-200/70 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-indigo-500/10 p-2 text-indigo-500"><Lock className="h-5 w-5" /></div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Change password</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Use a strong password with at least 8 characters.</p>
            </div>
          </div>
          <form className="mt-5 space-y-3" onSubmit={handlePasswordChange}>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            <button type="submit" className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400" disabled={busy}>{busy ? 'Working…' : 'Update password'}</button>
          </form>
        </div>

        <div className="rounded-[28px] border border-zinc-200/70 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-rose-500/10 p-2 text-rose-500"><ShieldAlert className="h-5 w-5" /></div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Workspace controls</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Suspend access or permanently wipe the tenant.</p>
            </div>
          </div>
          {error ? <div className="mt-4 rounded-2xl bg-rose-500/10 px-3 py-3 text-sm text-rose-600 dark:text-rose-300">{error}</div> : null}
          {status ? <div className="mt-4 rounded-2xl bg-emerald-500/10 px-3 py-3 text-sm text-emerald-600 dark:text-emerald-300">{status}</div> : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800" disabled={busy} onClick={handleDeactivate}>
              {confirmations.soft ? 'Confirm soft delete' : 'Soft delete'}
            </button>
            <button type="button" className="rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-400" disabled={busy} onClick={handleTerminate}>
              {confirmations.hard ? 'Confirm hard delete' : 'Hard delete'}
            </button>
          </div>
        </div>
      </section>
    </ProtectedLayout>
  );
}
