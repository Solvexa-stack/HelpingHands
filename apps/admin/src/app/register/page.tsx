'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, CheckCircle2, Landmark } from 'lucide-react';
import { verificationApi } from '@/lib/api';
import { useLanguage } from '@/contexts/language-context';

/**
 * W6-E3-S2 — public self-service registration for municipalities and youth
 * teams (flag-gated server-side: ORG_SELF_REGISTRATION, pilot allowlist).
 * After registering, the contact signs in, uploads the official registration
 * documents, and the Board runs the verification workflow.
 */
export default function RegisterOrganizationPage() {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    type: 'municipality',
    name: '',
    registrationNumber: '',
    adminEmail: '',
    adminFirstName: '',
    adminLastName: '',
    adminPassword: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ organizationId: number; message: string } | null>(null);

  const submit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await verificationApi.register(form);
      setResult(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || t('registerPage.registrationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [field]: e.target.value });

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-600 rounded-2xl mb-4">
              <Landmark className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('registerPage.title')}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {t('registerPage.subtitle')}
            </p>
          </div>

          {result ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <p className="text-gray-700">{result.message}</p>
              <p className="text-sm text-gray-500">
                {t('registerPage.nextStepsHint')}
              </p>
              <Link href="/login" className="btn-primary btn-md w-full inline-flex justify-center">
                {t('registerPage.signIn')}
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
              )}
              <div>
                <label className="label">{t('registerPage.orgTypeLabel')}</label>
                <select className="input" value={form.type} onChange={set('type')}>
                  <option value="municipality">{t('registerPage.typeMunicipality')}</option>
                  <option value="youth_team">{t('registerPage.typeYouthTeam')}</option>
                </select>
              </div>
              <div>
                <label className="label">{t('registerPage.officialNameLabel')}</label>
                <input className="input" value={form.name} onChange={set('name')} placeholder={t('registerPage.officialNamePlaceholder')} />
              </div>
              <div>
                <label className="label">{t('registerPage.regNumberLabel')}</label>
                <input className="input" value={form.registrationNumber} onChange={set('registrationNumber')} placeholder={t('registerPage.regNumberPlaceholder')} />
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-3">
                  <Building2 className="w-4 h-4" /> {t('registerPage.adminAccountHeading')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <input className="input" value={form.adminFirstName} onChange={set('adminFirstName')} placeholder={t('registerPage.firstNamePlaceholder')} />
                  <input className="input" value={form.adminLastName} onChange={set('adminLastName')} placeholder={t('registerPage.lastNamePlaceholder')} />
                </div>
                <input className="input mt-3" type="email" value={form.adminEmail} onChange={set('adminEmail')} placeholder={t('registerPage.officialEmailPlaceholder')} />
                <input className="input mt-3" type="password" value={form.adminPassword} onChange={set('adminPassword')} placeholder={t('registerPage.passwordPlaceholder')} />
              </div>
              <button
                className="btn-primary btn-md w-full"
                disabled={submitting || !form.name || !form.registrationNumber || !form.adminEmail || !form.adminPassword}
                onClick={submit}
              >
                {submitting ? t('registerPage.submitting') : t('registerPage.register')}
              </button>
              <p className="text-xs text-gray-400 text-center">
                {t('registerPage.alreadyRegistered')} <Link href="/login" className="text-primary-600 hover:underline">{t('registerPage.signIn')}</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
