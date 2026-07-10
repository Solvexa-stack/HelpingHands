'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, CheckCircle2, Landmark } from 'lucide-react';
import { verificationApi } from '@/lib/api';

/**
 * W6-E3-S2 — public self-service registration for municipalities and youth
 * teams (flag-gated server-side: ORG_SELF_REGISTRATION, pilot allowlist).
 * After registering, the contact signs in, uploads the official registration
 * documents, and the Board runs the verification workflow.
 */
export default function RegisterOrganizationPage() {
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
      setError(err?.response?.data?.message || 'Registration failed');
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
            <h1 className="text-2xl font-bold text-gray-900">Register your organization</h1>
            <p className="text-gray-500 text-sm mt-1">
              Municipalities and youth teams — verified onboarding with Board review
            </p>
          </div>

          {result ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <p className="text-gray-700">{result.message}</p>
              <p className="text-sm text-gray-500">
                Next: sign in with your new account and upload your official registration documents —
                the Board reviews them before activation.
              </p>
              <Link href="/login" className="btn-primary btn-md w-full inline-flex justify-center">
                Sign in
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
              )}
              <div>
                <label className="label">Organization type</label>
                <select className="input" value={form.type} onChange={set('type')}>
                  <option value="municipality">Municipality</option>
                  <option value="youth_team">Youth team</option>
                </select>
              </div>
              <div>
                <label className="label">Official name *</label>
                <input className="input" value={form.name} onChange={set('name')} placeholder="Municipality of …" />
              </div>
              <div>
                <label className="label">Official registration number *</label>
                <input className="input" value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="GOV-…" />
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-3">
                  <Building2 className="w-4 h-4" /> Administrator account
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <input className="input" value={form.adminFirstName} onChange={set('adminFirstName')} placeholder="First name *" />
                  <input className="input" value={form.adminLastName} onChange={set('adminLastName')} placeholder="Last name *" />
                </div>
                <input className="input mt-3" type="email" value={form.adminEmail} onChange={set('adminEmail')} placeholder="Official email *" />
                <input className="input mt-3" type="password" value={form.adminPassword} onChange={set('adminPassword')} placeholder="Password (8+ chars, mixed) *" />
              </div>
              <button
                className="btn-primary btn-md w-full"
                disabled={submitting || !form.name || !form.registrationNumber || !form.adminEmail || !form.adminPassword}
                onClick={submit}
              >
                {submitting ? 'Submitting…' : 'Register'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                Already registered? <Link href="/login" className="text-primary-600 hover:underline">Sign in</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
