'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileEdit, Gavel, History, Landmark, ListTodo, Megaphone, X, XCircle } from 'lucide-react';
import { governanceApi, projectsApi, studiesApi, votingApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/ui/toaster';
import { cn, formatDatetime } from '@/lib/utils';

/**
 * W3-E5 — Board workspace: cross-org review queue, decision recording with
 * mandatory rationale, live tallies, and the immutable decision history.
 */

const RATIONALE_TEMPLATES = [
  'Routine approval — study review complete; documentation in order.',
  'Community support confirmed by vote; budget verified.',
  'Insufficient documentation — see requested changes.',
];

const STATUS_BADGE: Record<string, string> = {
  in_review: 'bg-yellow-100 text-yellow-800',
  voting_open: 'bg-blue-100 text-blue-700',
  voting_closed: 'bg-purple-100 text-purple-700',
};

function Tally({ studyId }: { studyId: number }) {
  const { data } = useQuery({ queryKey: ['board-tally', studyId], queryFn: () => votingApi.getResults(studyId) });
  if (!data) return <span className="text-xs text-gray-400">…</span>;
  return (
    <span className="text-xs whitespace-nowrap">
      <span className="text-green-600 font-medium">{data.for.count} for</span>
      {' · '}
      <span className="text-red-600 font-medium">{data.against.count} against</span>
      {' · '}
      <span className="text-gray-500">{data.abstain.count} abstain</span>
    </span>
  );
}

export default function BoardPage() {
  const { hasBoardWorkspace } = useAuth();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'queue' | 'history' | 'projects'>('queue');
  const [decide, setDecide] = useState<{ studyId: number; projectName: string; kind: 'approved' | 'rejected' | 'changes_requested' } | null>(null);
  const [rationale, setRationale] = useState('');

  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ['board-queue'],
    queryFn: () => governanceApi.queue(),
    enabled: hasBoardWorkspace,
    refetchInterval: 60_000,
  });
  const { data: decisions } = useQuery({
    queryKey: ['board-decisions'],
    queryFn: () => governanceApi.decisions(),
    enabled: hasBoardWorkspace && tab === 'history',
  });
  const { data: projects } = useQuery({
    queryKey: ['board-projects'],
    queryFn: () => projectsApi.list({ limit: 100 }),
    enabled: hasBoardWorkspace && tab === 'projects',
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['board-queue'] });
    qc.invalidateQueries({ queryKey: ['board-decisions'] });
  };
  const onError = (err: any) => toastError(err?.response?.data?.message || 'Failed');

  const statusMutation = useMutation({
    mutationFn: ({ studyId, status, extra }: { studyId: number; status: string; extra?: Record<string, any> }) =>
      studiesApi.changeStatus(studyId, status, undefined, extra),
    onSuccess: () => { success('Status updated'); refresh(); },
    onError,
  });

  const decideMutation = useMutation({
    mutationFn: () => {
      if (!decide) return Promise.reject();
      // Approvals/rejections ride the study endpoint (the legacy contract —
      // internally routed through governance, no non-decision path exists);
      // changes_requested is the governance verb.
      if (decide.kind === 'approved') return studiesApi.changeStatus(decide.studyId, 'approved', undefined, { rationale });
      if (decide.kind === 'rejected') return studiesApi.changeStatus(decide.studyId, 'rejected', rationale);
      return governanceApi.recordDecision({
        subjectType: 'project_study',
        subjectId: decide.studyId,
        decision: 'changes_requested',
        rationale,
      });
    },
    onSuccess: () => { success('Decision recorded'); setDecide(null); setRationale(''); refresh(); },
    onError,
  });

  if (!hasBoardWorkspace) {
    return <div className="card p-8 text-center text-gray-500">The Board workspace is only available to platform governance roles.</div>;
  }

  const items = queue ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Landmark className="w-5 h-5 text-primary-600" />
        <h1 className="text-lg font-semibold">Board workspace</h1>
        <span className="text-sm text-gray-400">cross-organization governance · decisions are immutable and audited</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {([['queue', 'Review queue', ListTodo], ['history', 'Decision history', History], ['projects', 'All projects', Gavel]] as const).map(
          ([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === key
                  ? 'border-primary-600 text-primary-700 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon className="w-4 h-4" /> {label}
              {key === 'queue' && items.length > 0 && (
                <span className="badge bg-primary-100 text-primary-800 text-xs">{items.length}</span>
              )}
            </button>
          ),
        )}
      </div>

      {/* Review queue */}
      {tab === 'queue' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Study</th>
                <th className="table-header">Organization</th>
                <th className="table-header">Status</th>
                <th className="table-header">Waiting</th>
                <th className="table-header">Tally</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {queueLoading && <tr><td colSpan={6} className="p-6 text-center text-gray-400">Loading…</td></tr>}
              {!queueLoading && items.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400">Queue is clear — nothing awaits the Board.</td></tr>
              )}
              {items.map((item: any) => (
                <tr key={item.studyId}>
                  <td className="table-cell font-medium">
                    <Link href={`/studies/${item.studyId}`} className="text-primary-600 hover:underline">
                      {item.projectName}
                    </Link>
                    <span className="text-xs text-gray-400 ml-2">{item.category}</span>
                  </td>
                  <td className="table-cell">{item.organization?.name}</td>
                  <td className="table-cell">
                    <span className={cn('badge', STATUS_BADGE[item.status] ?? 'bg-gray-100 text-gray-500')}>{item.status}</span>
                  </td>
                  <td className="table-cell text-gray-500">{item.ageDays}d</td>
                  <td className="table-cell">
                    {item.status !== 'in_review' ? <Tally studyId={item.studyId} /> : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="table-cell">
                    <div className="flex flex-wrap gap-1">
                      {item.status === 'in_review' && (
                        <>
                          <button
                            className="btn-primary btn-sm gap-1"
                            onClick={() => statusMutation.mutate({ studyId: item.studyId, status: 'published' })}
                          >
                            <Megaphone className="w-3 h-3" /> Publish
                          </button>
                          <button
                            className="btn-secondary btn-sm gap-1"
                            onClick={() => setDecide({ studyId: item.studyId, projectName: item.projectName, kind: 'changes_requested' })}
                          >
                            <FileEdit className="w-3 h-3" /> Request changes
                          </button>
                        </>
                      )}
                      {item.status === 'voting_open' && (
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => statusMutation.mutate({ studyId: item.studyId, status: 'voting_closed' })}
                        >
                          Close voting
                        </button>
                      )}
                      {item.status === 'voting_closed' && (
                        <>
                          <button
                            className="btn-primary btn-sm gap-1"
                            onClick={() => setDecide({ studyId: item.studyId, projectName: item.projectName, kind: 'approved' })}
                          >
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </button>
                          <button
                            className="btn-secondary btn-sm gap-1 text-red-600"
                            onClick={() => setDecide({ studyId: item.studyId, projectName: item.projectName, kind: 'rejected' })}
                          >
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                          <button
                            className="btn-secondary btn-sm gap-1"
                            onClick={() => setDecide({ studyId: item.studyId, projectName: item.projectName, kind: 'changes_requested' })}
                          >
                            <FileEdit className="w-3 h-3" /> Changes
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
      )}

      {/* Decision history */}
      {tab === 'history' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Subject</th>
                <th className="table-header">Decision</th>
                <th className="table-header">Rationale</th>
                <th className="table-header">Decided by</th>
                <th className="table-header">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(decisions ?? []).map((d: any) => (
                <tr key={d.id}>
                  <td className="table-cell font-medium">{d.subjectType} #{d.subjectId}</td>
                  <td className="table-cell">
                    <span className={cn('badge', d.decision === 'approved' ? 'bg-green-100 text-green-800' : d.decision === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800')}>
                      {d.decision}
                    </span>
                  </td>
                  <td className="table-cell text-sm text-gray-600 max-w-md truncate" title={d.rationale}>{d.rationale}</td>
                  <td className="table-cell text-sm">
                    {d.decidedBy?.admin ? `${d.decidedBy.admin.firstName} ${d.decidedBy.admin.lastName}` : d.decidedBy?.email}
                  </td>
                  <td className="table-cell text-sm text-gray-500">{formatDatetime(d.decidedAt)}</td>
                </tr>
              ))}
              {(decisions ?? []).length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">No decisions recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Cross-org projects (W2 placeholder retained) */}
      {tab === 'projects' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Project</th>
                <th className="table-header">Owner org</th>
                <th className="table-header">Category</th>
                <th className="table-header">Value</th>
                <th className="table-header">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(projects?.data || []).map((p: any) => (
                <tr key={p.id}>
                  <td className="table-cell font-medium">{p.block?.translations?.[0]?.name ?? `#${p.id}`}</td>
                  <td className="table-cell">{p.ownerOrganizationId}</td>
                  <td className="table-cell">{p.category}</td>
                  <td className="table-cell">{Number(p.value).toLocaleString()}</td>
                  <td className="table-cell">{Number(p.progression)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Decision modal — rationale is mandatory */}
      {decide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDecide(null)}>
          <div className="card p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Gavel className="w-4 h-4" />
                {decide.kind === 'approved' ? 'Approve' : decide.kind === 'rejected' ? 'Reject' : 'Request changes'} — {decide.projectName}
              </h2>
              <button onClick={() => setDecide(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-500">
              The decision is recorded immutably with your rationale and appears in the audit trail and to the owning organization.
            </p>
            <textarea
              className="input min-h-24 w-full"
              placeholder="Rationale (required)"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {RATIONALE_TEMPLATES.map((t) => (
                <button key={t} className="badge bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer" onClick={() => setRationale(t)}>
                  {t.slice(0, 40)}…
                </button>
              ))}
            </div>
            <button
              className="btn-primary btn-md w-full"
              disabled={!rationale.trim() || decideMutation.isPending}
              onClick={() => decideMutation.mutate()}
            >
              Record decision
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
