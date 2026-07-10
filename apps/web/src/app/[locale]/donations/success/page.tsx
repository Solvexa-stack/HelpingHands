'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { paymentsApi } from '@/lib/api';
import { formatCurrency, getTranslation } from '@/lib/utils';

export default function PaymentSuccessPage() {
  const t = useTranslations('payment.success');
  const tDonations = useTranslations('donations');
  const locale = useLocale();
  const searchParams = useSearchParams();

  const donationId = searchParams.get('donation_id');
  const sessionId = searchParams.get('session_id');

  const [donation, setDonation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!donationId) {
      setError(t('missingReference'));
      setLoading(false);
      return;
    }
    paymentsApi
      .getDonationStatus(Number(donationId))
      .then((d) => setDonation(d))
      .catch(() => setError(t('confirmFailed')))
      .finally(() => setLoading(false));
  }, [donationId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin mx-auto" />
          <p className="text-gray-500">{t('confirming')}</p>
        </div>
      </div>
    );
  }

  if (error || !donation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card p-8 max-w-md w-full text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900">{t('verifyFailedTitle')}</h1>
          <p className="text-gray-500 text-sm">{error || t('unknownStatus')}</p>
          <div className="flex gap-3 justify-center pt-2">
            <Link href={`/${locale}/dashboard`} className="btn-primary text-sm py-2 px-5">
              {t('viewDashboard')}
            </Link>
            <Link href={`/${locale}/projects`} className="btn-secondary text-sm py-2 px-5">
              {t('backToProjects')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const projectTranslation = getTranslation(donation.project?.block?.translations || [], locale);
  const projectName = projectTranslation?.name || `Project #${donation.projectId}`;
  const isConfirmed = donation.status === 'completed' || donation.status === 'pending';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card p-8 max-w-md w-full text-center space-y-5">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">{t('title')}</h1>
          <p className="text-gray-500 mt-1 text-sm">{t('confirmed')}</p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{tDonations('fields.project')}</span>
            <span className="font-semibold text-gray-900 text-right max-w-[180px] truncate">{projectName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{tDonations('fields.amount')}</span>
            <span className="font-bold text-gray-900">{formatCurrency(Number(donation.amount), donation.currency, locale)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{tDonations('fields.provider')}</span>
            <span className="font-semibold capitalize text-gray-900">{donation.provider}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{tDonations('fields.status')}</span>
            <span className={`badge capitalize ${isConfirmed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
              {donation.status}
            </span>
          </div>
          {donation.externalId && (
            <div className="flex justify-between">
              <span className="text-gray-500">{t('transactionId')}</span>
              <span className="font-mono text-xs text-gray-700 truncate max-w-[160px]">{donation.externalId}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400">{t('emailSent')}</p>

        <div className="flex gap-3 justify-center pt-2">
          <Link href={`/${locale}/dashboard`} className="btn-primary text-sm py-2 px-5">
            {t('viewDonations')} →
          </Link>
          <Link href={`/${locale}/projects`} className="btn-secondary text-sm py-2 px-5">
            {t('backToProjects')} →
          </Link>
        </div>
      </div>
    </div>
  );
}
