'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, FileCheck2, Gavel, ShieldQuestion, X } from 'lucide-react';
import { governanceApi, verificationApi } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { cn, formatDatetime } from '@/lib/utils';

const STATE_BADGE: Record<string, string> = {
  submitted: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-700',
  verified: 'bg-purple-100 text-purple-700',
  active: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};

/**
 * W6-E3-S2 — Board verification queue: pending registrations move through
 * begin review → (documents + Board decision) → verify → activate; every
 * gate is a workflow guard, the buttons only ask.
 */
export function VerificationsTab() {
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [decide, setDecide] = useState<{ organizationId: number; name: string; kind: 'approved' | 'rejected' } | null>(null);
  const [rationale, setRationale] = useState('');

  const { data: queue, isLoading } = useQuery({
    queryKey: ['verification-queue'],
    queryFn: () => verificationApi.queue(),
    refetchInterval: 60_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['verification-queue'] });
  const onError = (err: any) => toastError(err?.response?.data?.message || 'Blocked by a verification guard');

  const action = useMutation({
    mutationFn: ({ organizationId, verb }: { organizationId: number; verb: 'beginReview' | 'verify' | 'reject' | 'activate' }) =>
      verificationApi[verb](organizationId),
    onSuccess: () => { success('Verification step recorded'); refresh(); },
    onError,
  });

  const decision = useMutation({
    mutationFn: () =>
      governanceApi.recordDecision({
        subjectType: 'organization',
        subjectId: decide!.organizationId,
        decision: decide!.kind,
        rationale,
      }),
    onSuccess: () => { success('Board decision recorded — now run the workflow step'); setDecide(null); setRationale(''); refresh(); },
    onError,
  });

  const items = queue ?? [];

  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="table-header">Organization</th>
            <th className="table-header">Type</th>
            <th className="table-header">Registration #</th>
            <th className="table-header">Documents</th>
            <th className="table-header">State</th>
            <th className="table-header">Waiting</th>
            <th className="table-header">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {isLoading && <tr><td colSpan={7} className="p-6 text-center text-gray-400">Loading…</td></tr>}
          {!isLoading && items.length === 0 && (
            <tr><td colSpan={7} className="p-8 text-center text-gray-400">No registrations await verification.</td></tr>
          )}
          {items.map((item: any) => (
            <tr key={item.organizationId}>
              <td className="table-cell font-medium">{item.name}</td>
              <td className="table-cell"><span className="badge bg-gray-100 text-gray-600">{item.orgType}</span></td>
              <td className="table-cell text-sm text-gray-500">{item.registrationNumber ?? '—'}</td>
              <td className="table-cell">
                <span className={cn('flex items-center gap-1 text-sm', item.documentsOnFile > 0 ? 'text-green-600' : 'text-amber-600')}>
                  <FileCheck2 className="w-3.5 h-3.5" /> {item.documentsOnFile} on file
                </span>
              </td>
              <td className="table-cell">
                <span className={cn('badge', STATE_BADGE[item.workflowState] ?? 'bg-gray-100 text-gray-500')}>
                  {item.workflowState ?? 'no instance'}
                </span>
              </td>
              <td className="table-cell text-gray-500">{item.ageDays}d</td>
              <td className="table-cell">
                <div className="flex flex-wrap gap-1">
                  {(item.workflowState === 'submitted' || item.workflowState === null) && (
                    <button
                      className="btn-primary btn-sm gap-1"
                      onClick={() => action.mutate({ organizationId: item.organizationId, verb: 'beginReview' })}
                    >
                      <ShieldQuestion className="w-3 h-3" /> Begin review
                    </button>
                  )}
                  {item.workflowState === 'under_review' && (
                    <>
                      <button
                        className="btn-secondary btn-sm gap-1"
                        onClick={() => setDecide({ organizationId: item.organizationId, name: item.name, kind: 'approved' })}
                      >
                        <Gavel className="w-3 h-3" /> Decide
                      </button>
                      <button
                        className="btn-primary btn-sm gap-1"
                        onClick={() => action.mutate({ organizationId: item.organizationId, verb: 'verify' })}
                        title="Requires documents on file + an approved Board decision"
                      >
                        <BadgeCheck className="w-3 h-3" /> Verify
                      </button>
                      <button
                        className="btn-secondary btn-sm text-red-600"
                        onClick={() => action.mutate({ organizationId: item.organizationId, verb: 'reject' })}
                        title="Requires a rejected Board decision"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {item.workflowState === 'verified' && (
                    <button
                      className="btn-primary btn-sm gap-1"
                      onClick={() => action.mutate({ organizationId: item.organizationId, verb: 'activate' })}
                    >
                      <BadgeCheck className="w-3 h-3" /> Activate
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {decide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDecide(null)}>
          <div className="card p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Gavel className="w-4 h-4" /> Board decision — {decide.name}
              </h2>
              <button onClick={() => setDecide(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-2">
              {(['approved', 'rejected'] as const).map((kind) => (
                <button
                  key={kind}
                  className={cn('badge cursor-pointer', decide.kind === kind ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-500')}
                  onClick={() => setDecide({ ...decide, kind })}
                >
                  {kind}
                </button>
              ))}
            </div>
            <textarea
              className="input min-h-24 w-full"
              placeholder="Rationale (required) — e.g. registration decree verified against the official gazette"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
            <button
              className="btn-primary btn-md w-full"
              disabled={!rationale.trim() || decision.isPending}
              onClick={() => decision.mutate()}
            >
              Record decision
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
