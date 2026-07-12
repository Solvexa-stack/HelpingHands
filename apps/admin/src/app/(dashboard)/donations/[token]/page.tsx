'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, XCircle, Clock, Ban, Download, ShieldCheck } from 'lucide-react';
import { donationsApi } from '@/lib/api';
import { formatCurrency, formatDatetime, getTranslation, STATUS_COLORS, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { useLanguage } from '@/contexts/language-context';

const STATUS_ICONS: Record<string, any> = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  cancelled: Ban,
};

export default function DonationDetailPage({ params }: { params: { token: string } }) {
  const { t, locale } = useLanguage();
  const { token } = params;
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');

  const { data: donation, isLoading } = useQuery({
    queryKey: ['donation', token],
    queryFn: () => donationsApi.getByToken(token),
  });

  const updateMutation = useMutation({
    mutationFn: (status: string) => donationsApi.updateStatus(donation.id, { status, notes: notes || undefined }),
    onSuccess: () => {
      success(t('donations.toast.updated'));
      qc.invalidateQueries({ queryKey: ['donation', token] });
      qc.invalidateQueries({ queryKey: ['donations'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (err: any) => toastError(err?.response?.data?.message || t('donations.toast.updateFailed')),
  });

  if (isLoading) return <div className="flex items-center justify-center py-20 text-gray-400">{t('common.loading')}</div>;
  if (!donation) return <div className="py-20 text-center text-gray-400">{t('donations.detail.notFound')}</div>;

  const projectName = getTranslation(donation.project?.block?.translations || [], locale)?.name || t('common.notAvailable');
  const participantName = `${donation.participant?.firstName || ''} ${donation.participant?.lastName || ''}`.trim() || t('common.notAvailable');
  const StatusIcon = STATUS_ICONS[donation.status] || Clock;
  const isPending = donation.status === 'pending';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/donations" className="btn-ghost btn-sm p-1.5 rounded-lg"><ArrowLeft className="w-4 h-4" /></Link>
          <h1 className="page-title">{t('donations.detail.donationNumber', { id: donation.id })}</h1>
        </div>
        <span className={cn('badge gap-1.5', STATUS_COLORS[donation.status])}>
          <StatusIcon className="w-3.5 h-3.5" />
          {t(`donations.statuses.${donation.status}`) || donation.status}
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left — donation details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">{t('donations.detail.information')}</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-2.5 text-gray-500 font-medium w-40">{t('donations.participant')}</td>
                  <td className="py-2.5 text-gray-900 font-semibold">
                    <Link href={`/participants/${donation.participantId}`} className="hover:text-primary-600 hover:underline">
                      {participantName}
                    </Link>
                    {donation.participant?.user?.email && (
                      <p className="text-xs text-gray-400 font-normal">{donation.participant.user.email}</p>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 text-gray-500 font-medium">{t('donations.project')}</td>
                  <td className="py-2.5 text-gray-900 font-semibold">
                    <Link href={`/projects/${donation.projectId}`} className="hover:text-primary-600 hover:underline">
                      {projectName}
                    </Link>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 text-gray-500 font-medium">{t('donations.amount')}</td>
                  <td className="py-2.5 text-primary-600 font-bold text-base">{formatCurrency(Number(donation.amount), undefined, locale)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 text-gray-500 font-medium">{t('donations.date')}</td>
                  <td className="py-2.5 text-gray-900 font-semibold">{formatDatetime(donation.createdAt, locale)}</td>
                </tr>
                {donation.approvedAt && (
                  <tr>
                    <td className="py-2.5 text-gray-500 font-medium">{t('donations.approvedAt')}</td>
                    <td className="py-2.5 text-gray-900 font-semibold">{formatDatetime(donation.approvedAt, locale)}</td>
                  </tr>
                )}
                {donation.approver && (
                  <tr>
                    <td className="py-2.5 text-gray-500 font-medium">{t('donations.detail.approvedBy')}</td>
                    <td className="py-2.5 text-gray-900 font-semibold">{donation.approver.firstName} {donation.approver.lastName}</td>
                  </tr>
                )}
                {donation.notes && (
                  <tr>
                    <td className="py-2.5 text-gray-500 font-medium align-top">{t('donations.detail.notes')}</td>
                    <td className="py-2.5 text-gray-900">{donation.notes}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <button
              onClick={() => donationsApi.downloadQr(token)}
              className="btn-secondary btn-md gap-2"
            >
              <Download className="w-4 h-4" />
              {t('donations.downloadQrTitle')}
            </button>
          </div>
        </div>

        {/* Right — verification action */}
        <div className="space-y-5">
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary-600" />
              <h3 className="font-semibold text-gray-900">{t('donations.detail.actionsHeading')}</h3>
            </div>

            {isPending ? (
              <>
                <p className="text-sm text-gray-500 bg-blue-50 px-4 py-3 rounded-lg">
                  {t('donations.detail.pendingInstructions')}
                </p>
                <div>
                  <label className="label">{t('donations.verify.notesLabel')}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="input resize-none"
                    placeholder={t('donations.verify.notesPlaceholder')}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => updateMutation.mutate('rejected')}
                    disabled={updateMutation.isPending}
                    className="flex-1 btn btn-md bg-red-50 text-red-600 hover:bg-red-100 gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    {t('donations.verify.reject')}
                  </button>
                  <button
                    onClick={() => updateMutation.mutate('approved')}
                    disabled={updateMutation.isPending}
                    className="flex-1 btn-primary btn-md gap-2"
                  >
                    {updateMutation.isPending ? (
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : <CheckCircle className="w-4 h-4" />}
                    {t('donations.verify.approve')}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 bg-gray-50 px-4 py-3 rounded-lg">
                {t('donations.detail.finalized')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
