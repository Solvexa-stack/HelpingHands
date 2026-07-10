'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, CheckCircle2, FileSearch, Undo2, X } from 'lucide-react';
import { orgReportsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { cn, formatDatetime } from '@/lib/utils';

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
  const onError = (err: any) => toastError(err?.response?.data?.message || 'Failed');

  const beginReview = useMutation({
    mutationFn: (id: number) => orgReportsApi.beginReview(id),
    onSuccess: () => { success('Report taken into review'); refresh(); },
    onError,
  });
  const accept = useMutation({
    mutationFn: (id: number) => orgReportsApi.accept(id),
    onSuccess: () => { success('Report accepted'); refresh(); },
    onError,
  });
  const returnReport = useMutation({
    mutationFn: () => orgReportsApi.returnWithComments(returning!.id, note),
    onSuccess: () => { success('Report returned with comments'); setReturning(null); setNote(''); refresh(); },
    onError,
  });

  const reports = data?.reports ?? [];
  const overdue = data?.overdue ?? [];

  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <div className="card p-4 border-l-4 border-amber-500 space-y-2">
          <div className="flex items-center gap-2 font-medium text-amber-700">
            <AlarmClock className="w-4 h-4" /> Overdue reporting obligations
          </div>
          {overdue.map((o: any) => (
            <div key={o.agreementId} className="text-sm text-gray-600">
              <span className="font-medium">{o.organization?.name}</span> — “{o.agreementTitle}”:{' '}
              {o.obligations.map((ob: any) => `${ob.type} due ${formatDatetime(ob.dueAt)}`).join(' · ')}
              <span className="text-xs text-amber-600 ml-2">disbursements may be blocked (agreement terms)</span>
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Report</th>
              <th className="table-header">Organization</th>
              <th className="table-header">Type</th>
              <th className="table-header">Agreement</th>
              <th className="table-header">Submitted</th>
              <th className="table-header">Status</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <tr><td colSpan={7} className="p-6 text-center text-gray-400">Loading…</td></tr>}
            {!isLoading && reports.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-gray-400">No reports await review.</td></tr>
            )}
            {reports.map((r: any) => (
              <tr key={r.id}>
                <td className="table-cell font-medium">
                  <button className="text-primary-600 hover:underline" onClick={() => setInspect(r)}>{r.title}</button>
                </td>
                <td className="table-cell">{r.organization?.name}</td>
                <td className="table-cell"><span className="badge bg-gray-100 text-gray-600">{r.type}</span></td>
                <td className="table-cell text-sm text-gray-500">{r.fundingAgreement?.title ?? '—'}</td>
                <td className="table-cell text-sm text-gray-500">{formatDatetime(r.submittedAt)}</td>
                <td className="table-cell">
                  <span className={cn('badge', STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-500')}>{r.status}</span>
                </td>
                <td className="table-cell">
                  <div className="flex flex-wrap gap-1">
                    {r.status === 'submitted' && (
                      <button className="btn-primary btn-sm gap-1" onClick={() => beginReview.mutate(r.id)}>
                        <FileSearch className="w-3 h-3" /> Review
                      </button>
                    )}
                    {r.status === 'under_review' && (
                      <>
                        <button className="btn-primary btn-sm gap-1" onClick={() => accept.mutate(r.id)}>
                          <CheckCircle2 className="w-3 h-3" /> Accept
                        </button>
                        <button
                          className="btn-secondary btn-sm gap-1 text-red-600"
                          onClick={() => setReturning({ id: r.id, title: r.title })}
                        >
                          <Undo2 className="w-3 h-3" /> Return
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
              {inspect.type} · {inspect.organization?.name}
              {inspect.periodStart && <> · period {formatDatetime(inspect.periodStart)} → {formatDatetime(inspect.periodEnd)}</>}
            </div>
            <pre className="bg-gray-50 dark:bg-gray-900 rounded p-3 text-xs overflow-auto max-h-72">
              {JSON.stringify(inspect.payload ?? {}, null, 2)}
            </pre>
            {inspect.reviewNote && (
              <div className="text-sm"><span className="font-medium">Review note:</span> {inspect.reviewNote}</div>
            )}
          </div>
        </div>
      )}

      {returning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setReturning(null)}>
          <div className="card p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Return “{returning.title}”</h2>
              <button onClick={() => setReturning(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-500">Comments are mandatory — the submitting organization sees them and resubmits.</p>
            <textarea
              className="input min-h-24 w-full"
              placeholder="What must be corrected?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              className="btn-primary btn-md w-full"
              disabled={!note.trim() || returnReport.isPending}
              onClick={() => returnReport.mutate()}
            >
              Return with comments
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
