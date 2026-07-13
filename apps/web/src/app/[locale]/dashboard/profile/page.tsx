'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, User, Mail, Save, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { participantsApi } from '@/lib/api';

const REPRESENTATIONS = ['personal', 'company', 'organization'] as const;

export default function ProfilePage() {
  const { user, loading, refreshUser } = useAuth();
  const t = useTranslations('dashboard');
  const tAuth = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();

  const [form, setForm] = useState({ firstName: '', lastName: '', representation: 'personal' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace(`/${locale}/auth/login?redirect=/dashboard/profile`);
  }, [user, loading, router, locale]);

  useEffect(() => {
    if (user?.participant) {
      setForm({
        firstName: user.participant.firstName || '',
        lastName: user.participant.lastName || '',
        representation: user.participant.representation || 'personal',
      });
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: () => participantsApi.update(user!.participant!.id, form),
    onSuccess: async () => {
      setSaved(true);
      if (refreshUser) await refreshUser();
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
    </div>
  );

  if (!user) return null;

  const initials = `${form.firstName?.[0] || ''}${form.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link href={`/${locale}/dashboard`} className="p-2 rounded-lg hover:bg-gray-200 transition-colors text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">{t('profile')}</h1>
            <p className="text-gray-500 text-sm">{t('profilePage.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Avatar card */}
          <div className="card p-6 flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0 overflow-hidden">
              {user.avatar
                ? <img src={user.avatar} alt={form.firstName} className="w-full h-full object-cover" />
                : initials || <User className="w-8 h-8" />
              }
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg">{form.firstName} {form.lastName}</p>
              <p className="text-gray-500 text-sm">{user.email}</p>
              <span className="inline-block mt-1 text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                {tAuth(form.representation)}
              </span>
            </div>
          </div>

          {/* Edit form */}
          <div className="card p-6 space-y-5">
            <h2 className="font-semibold text-gray-900">{t('profilePage.personalInfo')}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{tAuth('firstName')}</label>
                <input
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder={t('profilePage.firstNamePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{tAuth('lastName')}</label>
                <input
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder={t('profilePage.lastNamePlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{tAuth('email')}</label>
              <div className="relative">
                <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className="w-full ps-10 pe-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                  value={user.email}
                  disabled
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{t('profilePage.emailLocked')}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{tAuth('representation')}</label>
              <select
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={form.representation}
                onChange={(e) => setForm({ ...form, representation: e.target.value })}
              >
                {REPRESENTATIONS.map((r) => (
                  <option key={r} value={r}>{tAuth(r)}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pt-2">
              {saved && (
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  {t('profilePage.saveSuccess')}
                </div>
              )}
              <div className="ms-auto">
                <button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending || !form.firstName || !form.lastName}
                  className="btn-primary text-sm py-2.5 px-6 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {mutation.isPending
                    ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    : <Save className="w-4 h-4" />
                  }
                  {t('profilePage.saveChanges')}
                </button>
              </div>
            </div>
          </div>

          {/* Account info */}
          <div className="card p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">{t('profilePage.accountSection')}</h2>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">{t('profilePage.statusLabel')}</span>
              <span className="text-sm font-medium text-green-600 bg-green-50 px-2.5 py-0.5 rounded-full">{t('profilePage.activeValue')}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-500">{t('profilePage.memberSince')}</span>
              <span className="text-sm font-medium text-gray-900">
                {user.joiningDate ? new Date(user.joiningDate).toLocaleDateString(locale, { year: 'numeric', month: 'long' }) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
