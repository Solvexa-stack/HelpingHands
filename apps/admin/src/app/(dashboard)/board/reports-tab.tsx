'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, CheckCircle2, FileSearch, Undo2, X } from 'lucide-react';
import { orgReportsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { cn, formatDatetime } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

const STATUS_BADGE: Record<string, string> = {
  submitted: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-800',
  returned: 'bg-red-100 text-red-700',
};

/**
 * W6-E6-S1 — Board report review: submitted progress/financial reports move
 * submitted → under_review → accepted | returned (with mandatory comments);
 * overdue obligations per agreement are flagged alongside.
 */
export function ReportsTab() {
  const { t, locale } = useLanguage();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [returning, setReturning] = useState<{ id: number; title: string } | null>(null);
  const [note, setNote] = useState('');
  const [inspect, setInspect] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['org-reports-queue'],
    queryFn: () => orgReportsApi.queue(),
    refetchInterval: 60_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['org-reports-queue'] });
  const onError = (err: any) => toastError(err?.response?.data?.message || t('common.failed'));

  const beginReview = useMutation({
    mutationFn: (id: number) => orgReportsApi.beginReview(id),
    onSuccess: () => { success(t('board.reportsTab.toast.beginReview')); refresh(); },
    onError,
  });
  const accept = useMutation({
    mutationFn: (id: number) => orgReportsApi.accept(id),
    onSuccess: () => { success(t('board.reportsTab.toast.accepted')); refresh(); },
    onError,
  });
  const returnReport = useMutation({
    mutationFn: () => orgReportsApi.returnWithComments(returning!.id, note),
    onSuccess: () => { success(t('board.reportsTab.toast.returned')); setReturning(null); setNote(''); refresh(); },
    onError,
  });

  const reports = data?.reports ?? [];
  const overdue = data?.overdue ?? [];

  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <div className="card p-4 border-l-4 border-amber-500 space-y-2">
          <div className="flex items-center gap-2 font-medium text-amber-700">
            <AlarmClock className="w-4 h-4" /> {t('board.reportsTab.overdueHeading')}
          </div>
          {overdue.map((o: any) => (
            <div key={o.agreementId} className="text-sm text-gray-600">
              <span className="font-medium">{o.organization?.name}</span> — “{o.agreementTitle}”:{' '}
              {o.obligations
                .map((ob: any) => t('board.reportsTab.obligationDue', { type: ob.type, date: formatDatetime(ob.dueAt, locale) }))
                .join(' · ')}
              <span className="text-xs text-amber-600 ms-2">{t('board.reportsTab.disbursementsBlockedNote')}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">{t('board.reportsTab.colReport')}</th>
              <th className="table-header">{t('board.reportsTab.colOrganization')}</th>
              <th className="table-header">{t('board.reportsTab.colType')}</th>
              <th className="table-header">{t('board.reportsTab.colAgreement')}</th>
              <th className="table-header">{t('board.reportsTab.colSubmitted')}</th>
              <th className="table-header">{t('common.status')}</th>
              <th className="table-header">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <tr><td colSpan={7} className="p-6 text-center text-gray-400">{t('common.loading')}</td></tr>}
            {!isLoading && reports.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-gray-400">{t('board.reportsTab.empty')}</td></tr>
            )}
            {reports.map((r: any) => (
              <tr key={r.id}>
                <td className="table-cell font-medium">
                  <button className="text-primary-600 hover:underline" onClick={() => setInspect(r)}>{r.title}</button>
                </td>
                <td className="table-cell">{r.organization?.name}</td>
                <td className="table-cell"><span className="badge bg-gray-100 text-gray-600">{r.type}</span></td>
                <td className="table-cell text-sm text-gray-500">{r.fundingAgreement?.title ?? '—'}</td>
                <td className="table-cell text-sm text-gray-500">{formatDatetime(r.submittedAt, locale)}</td>
                <td className="table-cell">
                  <span className={cn('badge', STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-500')}>{r.status}</span>
                </td>
                <td className="table-cell">
                  <div className="flex flex-wrap gap-1">
                    {r.status === 'submitted' && (
                      <button className="btn-primary btn-sm gap-1" onClick={() => beginReview.mutate(r.id)}>
                        <FileSearch className="w-3 h-3" /> {t('board.reportsTab.actions.review')}
                      </button>
                    )}
                    {r.status === 'under_review' && (
                      <>
                        <button className="btn-primary btn-sm gap-1" onClick={() => accept.mutate(r.id)}>
                          <CheckCircle2 className="w-3 h-3" /> {t('board.reportsTab.actions.accept')}
                        </button>
                        <button
                          className="btn-secondary btn-sm gap-1 text-red-600"
                          onClick={() => setReturning({ id: r.id, title: r.title })}
                        >
                          <Undo2 className="w-3 h-3" /> {t('board.reportsTab.actions.return')}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inspect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setInspect(null)}>
          <div className="card p-6 w-full max-w-xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{inspect.title}</h2>
              <button onClick={() => setInspect(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-sm text-gray-500">
              {t('board.reportsTab.inspect.typeOrgLine', { type: inspect.type, org: inspect.organization?.name })}
              {inspect.periodStart && (
                <>
                  {' '}
                  {t('board.reportsTab.inspect.periodLine', {
                    start: formatDatetime(inspect.periodStart, locale),
                    end: formatDatetime(inspect.periodEnd, locale),
                  })}
                </>
              )}
            </div>
            <pre className="bg-gray-50 dark:bg-gray-900 rounded p-3 text-xs overflow-auto max-h-72">
              {JSON.stringify(inspect.payload ?? {}, null, 2)}
            </pre>
            {inspect.reviewNote && (
              <div className="text-sm"><span className="font-medium">{t('board.reportsTab.inspect.reviewNoteLabel')}</span> {inspect.reviewNote}</div>
            )}
          </div>
        </div>
      )}

      {returning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setReturning(null)}>
          <div className="card p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('board.reportsTab.returnModal.title', { title: returning.title })}</h2>
              <button onClick={() => setReturning(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-500">{t('board.reportsTab.returnModal.description')}</p>
            <textarea
              className="input min-h-24 w-full"
              placeholder={t('board.reportsTab.returnModal.placeholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              className="btn-primary btn-md w-full"
              disabled={!note.trim() || returnReport.isPending}
              onClick={() => returnReport.mutate()}
            >
              {t('board.reportsTab.returnModal.submit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
