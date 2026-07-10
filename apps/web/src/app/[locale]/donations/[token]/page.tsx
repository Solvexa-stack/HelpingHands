import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CheckCircle, Clock, XCircle, Download } from 'lucide-react';
import { donationsApi } from '@/lib/api';
import { formatCurrency, formatDate, getTranslation } from '@/lib/utils';
import type { Metadata } from 'next';

interface Props { params: { locale: string; token: string } }

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'donations' });
  return { title: t('verify.metaTitle') };
}

export default async function DonationVerifyPage({ params: { locale, token } }: Props) {
  const t = await getTranslations({ locale, namespace: 'donations' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const tDashboard = await getTranslations({ locale, namespace: 'dashboard' });
  const tDonate = await getTranslations({ locale, namespace: 'donate' });

  let donation: any;
  try {
    donation = await donationsApi.getByToken(token);
  } catch { notFound(); }

  const translation = getTranslation(donation.project?.block?.translations || [], locale);

  const statusConfig: Record<string, { icon: any; color: string; label: string; bg: string }> = {
    pending: { icon: Clock, color: 'text-yellow-600', label: t('status.pendingPayment'), bg: 'bg-yellow-50' },
    approved: { icon: CheckCircle, color: 'text-green-600', label: t('status.paymentApproved'), bg: 'bg-green-50' },
    rejected: { icon: XCircle, color: 'text-red-600', label: tDashboard('status.rejected'), bg: 'bg-red-50' },
    cancelled: { icon: XCircle, color: 'text-gray-600', label: tDashboard('status.cancelled'), bg: 'bg-gray-50' },
  };

  const { icon: StatusIcon, color, label, bg } = statusConfig[donation.status] || statusConfig.pending;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container max-w-xl">
        {/* Status card */}
        <div className={`card p-8 text-center mb-6 ${bg}`}>
          <StatusIcon className={`w-16 h-16 mx-auto mb-4 ${color}`} />
          <h1 className={`text-2xl font-extrabold mb-2 ${color}`}>{label}</h1>
          <p className="text-gray-500 text-sm">{t('verify.donationNumber', { id: donation.id })}</p>
        </div>

        {/* Details */}
        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-gray-900 text-lg">{t('verify.detailsHeading')}</h2>

          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {[
                [t('fields.participant'), `${donation.participant?.firstName} ${donation.participant?.lastName}`],
                [t('fields.project'), translation?.name || tCommon('notAvailable')],
                [t('fields.amount'), formatCurrency(Number(donation.amount), undefined, locale)],
                [t('fields.date'), formatDate(donation.createdAt, locale)],
                [t('fields.status'), donation.status],
                ...(donation.approvedAt ? [[t('fields.approvedAt'), formatDate(donation.approvedAt, locale)]] : []),
                ...(donation.notes ? [[t('fields.notes'), donation.notes]] : []),
              ].map(([label, value]) => (
                <tr key={label} className="py-2">
                  <td className="py-2.5 text-gray-500 font-medium w-32">{label}</td>
                  <td className="py-2.5 text-gray-900 font-semibold capitalize">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {donation.status === 'pending' && (
            <div className="pt-4 space-y-3">
              <p className="text-sm text-gray-500 bg-blue-50 px-4 py-3 rounded-lg">
                {t('verify.pendingInstructions')}
              </p>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/v1/donations/${token}/qr/download`}
                download
                className="btn-primary w-full justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                {tDonate('download')}
              </a>
            </div>
          )}

          <div className="pt-2">
            <Link href={`/${locale}`} className="text-primary-600 text-sm font-medium hover:underline">
              ← {t('verify.backToHome')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
