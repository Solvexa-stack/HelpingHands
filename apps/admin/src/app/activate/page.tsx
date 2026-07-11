'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, KeyRound, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useLanguage } from '@/contexts/language-context';

/**
 * Invitation activation (org onboarding). Public page: the invitee follows
 * /activate?token=… (from the invitation email — or, in development, the link
 * shown right in the invite UI), sets their identity + password, receives
 * JWTs and lands in their Organization Workspace.
 */
function ActivateForm() {
  const { t } = useLanguage();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;
  const canSubmit = token && form.firstName && form.lastName && form.password.length >= 8 && form.password === form.confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await authApi.activateInvite({
        token,
        firstName: form.firstName,
        lastName: form.lastName,
        password: form.password,
      });
      localStorage.setItem('admin_access_token', data.accessToken);
      localStorage.setItem('admin_refresh_token', data.refreshToken);
      // Full navigation: AuthProvider re-initializes and the workspace guards
      // route the fresh org member into /org/dashboard.
      window.location.assign('/org/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || t('activatePage.activationFailed'));
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <p className="text-sm text-red-600 text-center">
        {t('activatePage.missingToken')}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          className="input"
          placeholder={t('activatePage.firstNamePlaceholder')}
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          autoFocus
        />
        <input
          className="input"
          placeholder={t('activatePage.lastNamePlaceholder')}
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
        />
      </div>
      <input
        className="input w-full"
        type="password"
        placeholder={t('activatePage.passwordPlaceholder')}
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      <input
        className="input w-full"
        type="password"
        placeholder={t('activatePage.confirmPasswordPlaceholder')}
        value={form.confirm}
        onChange={(e) => setForm({ ...form, confirm: e.target.value })}
      />
      {mismatch && <p className="text-xs text-red-600">{t('activatePage.passwordMismatch')}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary btn-md w-full gap-2" disabled={!canSubmit || submitting}>
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        {t('activatePage.activateAccount')}
      </button>
    </form>
  );
}

export default function ActivatePage() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mx-auto">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-semibold">{t('activatePage.heading')}</h1>
          <p className="text-sm text-gray-500">
            {t('activatePage.subtitle')}
          </p>
        </div>
        <Suspense fallback={<p className="text-center text-sm text-gray-400">{t('activatePage.loading')}</p>}>
          <ActivateForm />
        </Suspense>
      </div>
    </div>
  );
}
