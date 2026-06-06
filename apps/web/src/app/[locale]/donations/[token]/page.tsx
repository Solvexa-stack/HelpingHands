import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Clock, XCircle, Download } from 'lucide-react';
import { donationsApi } from '@/lib/api';
import { formatCurrency, formatDate, getTranslation } from '@/lib/utils';
import type { Metadata } from 'next';

interface Props { params: { locale: string; token: string } }

export const metadata: Metadata = { title: 'Donation Verification' };

export default async function DonationVerifyPage({ params: { locale, token } }: Props) {
  let donation: any;
  try {
    donation = await donationsApi.getByToken(token);
  } catch { notFound(); }

  const translation = getTranslation(donation.project?.block?.translations || [], locale);

  const statusConfig: Record<string, { icon: any; color: string; label: string; bg: string }> = {
    pending: { icon: Clock, color: 'text-yellow-600', label: 'Pending Payment', bg: 'bg-yellow-50' },
    approved: { icon: CheckCircle, color: 'text-green-600', label: 'Payment Approved', bg: 'bg-green-50' },
    rejected: { icon: XCircle, color: 'text-red-600', label: 'Rejected', bg: 'bg-red-50' },
    cancelled: { icon: XCircle, color: 'text-gray-600', label: 'Cancelled', bg: 'bg-gray-50' },
  };

  const { icon: StatusIcon, color, label, bg } = statusConfig[donation.status] || statusConfig.pending;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container max-w-xl">
        {/* Status card */}
        <div className={`card p-8 text-center mb-6 ${bg}`}>
          <StatusIcon className={`w-16 h-16 mx-auto mb-4 ${color}`} />
          <h1 className={`text-2xl font-extrabold mb-2 ${color}`}>{label}</h1>
          <p className="text-gray-500 text-sm">Donation #{donation.id}</p>
        </div>

        {/* Details */}
        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-gray-900 text-lg">Donation Details</h2>

          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {[
                ['Participant', `${donation.participant?.firstName} ${donation.participant?.lastName}`],
                ['Project', translation?.name || 'N/A'],
                ['Amount', formatCurrency(Number(donation.amount))],
                ['Date', formatDate(donation.createdAt, locale)],
                ['Status', donation.status],
                ...(donation.approvedAt ? [['Approved At', formatDate(donation.approvedAt, locale)]] : []),
                ...(donation.notes ? [['Notes', donation.notes]] : []),
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
                This donation is awaiting payment. Please visit our office with this QR code to complete the payment.
              </p>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/v1/donations/${token}/qr/download`}
                download
                className="btn-primary w-full justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download QR Code
              </a>
            </div>
          )}

          <div className="pt-2">
            <Link href={`/${locale}`} className="text-primary-600 text-sm font-medium hover:underline">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
