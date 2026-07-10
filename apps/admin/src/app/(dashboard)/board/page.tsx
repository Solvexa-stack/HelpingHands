'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CheckCircle2, FileEdit, FileText, Gavel, History, Landmark, ListTodo, Megaphone, X, XCircle } from 'lucide-react';
import { governanceApi, orgReportsApi, projectsApi, studiesApi, verificationApi, votingApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/ui/toaster';
import { cn, formatDatetime } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';
import { VerificationsTab } from './verifications-tab';
import { ReportsTab } from './reports-tab';
import { BoardDashboardTab } from './board-dashboard-tab';

/**
 * W3-E5 — Board workspace: cross-org review queue, decision recording with
 * mandatory rationale, live tallies, and the immutable decision history.
 */

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
  const { t, locale } = useLanguage();
  const { hasBoardWorkspace } = useAuth();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'queue' | 'verifications' | 'reports' | 'dashboard' | 'history' | 'projects'>('queue');
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
  // W6: badge counts for the new queues
  const { data: verificationQueue } = useQuery({
    queryKey: ['verification-queue'],
    queryFn: () => verificationApi.queue(),
    enabled: hasBoardWorkspace,
    refetchInterval: 60_000,
  });
  const { data: reportQueue } = useQuery({
    queryKey: ['org-reports-queue'],
    queryFn: () => orgReportsApi.queue(),
    enabled: hasBoardWorkspace,
    refetchInterval: 60_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['board-queue'] });
    qc.invalidateQueries({ queryKey: ['board-decisions'] });
  };
  const onError = (err: any) => toastError(err?.response?.data?.message || t('common.failed'));

  const statusMutation = useMutation({
    mutationFn: ({ studyId, status, extra }: { studyId: number; status: string; extra?: Record<string, any> }) =>
      studiesApi.changeStatus(studyId, status, undefined, extra),
    onSuccess: () => { success(t('board.toast.statusUpdated')); refresh(); },
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
    onSuccess: () => { success(t('board.toast.decisionRecorded')); setDecide(null); setRationale(''); refresh(); },
    onError,
  });

  if (!hasBoardWorkspace) {
    return <div className="card p-8 text-center text-gray-500">{t('board.accessRestricted')}</div>;
  }

  const items = queue ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Landmark className="w-5 h-5 text-primary-600" />
        <h1 className="text-lg font-semibold">{t('board.title')}</h1>
        <span className="text-sm text-gray-400">{t('board.subtitle')}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {([
          ['queue', t('board.tabs.queue'), ListTodo],
          ['verifications', t('board.tabs.verifications'), BadgeCheck],
          ['reports', t('board.tabs.reports'), FileText],
          ['dashboard', t('board.tabs.dashboard'), Landmark],
          ['history', t('board.tabs.history'), History],
          ['projects', t('board.tabs.projects'), Gavel],
        ] as const).map(
          ([key, label, Icon]) => {
            const badge =
              key === 'queue'
                ? items.length
                : key === 'verifications'
                  ? (verificationQueue ?? []).length
                  : key === 'reports'
                    ? (reportQueue?.reports ?? []).length + (reportQueue?.overdue ?? []).length
                    : 0;
            return (
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
                {badge > 0 && (
                  <span className="badge bg-primary-100 text-primary-800 text-xs">{badge}</span>
                )}
              </button>
            );
          },
        )}
      </div>

      {/* W6: org verification queue */}
      {tab === 'verifications' && <VerificationsTab />}
      {/* W6: report review queue + overdue flags */}
      {tab === 'reports' && <ReportsTab />}
      {/* W7: cross-entity KPIs on the transparency read layer */}
      {tab === 'dashboard' && <BoardDashboardTab />}

      {/* Review queue */}
      {tab === 'queue' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{t('board.queue.colStudy')}</th>
                <th className="table-header">{t('board.queue.colOrganization')}</th>
                <th className="table-header">{t('common.status')}</th>
                <th className="table-header">{t('board.queue.colWaiting')}</th>
                <th className="table-header">{t('board.queue.colTally')}</th>
                <th className="table-header">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {queueLoading && <tr><td colSpan={6} className="p-6 text-center text-gray-400">{t('common.loading')}</td></tr>}
              {!queueLoading && items.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400">{t('board.queue.empty')}</td></tr>
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
                            <Megaphone className="w-3 h-3" /> {t('common.publish')}
                          </button>
                          <button
                            className="btn-secondary btn-sm gap-1"
                            onClick={() => setDecide({ studyId: item.studyId, projectName: item.projectName, kind: 'changes_requested' })}
                          >
                            <FileEdit className="w-3 h-3" /> {t('board.actions.requestChanges')}
                          </button>
                        </>
                      )}
                      {item.status === 'voting_open' && (
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => statusMutation.mutate({ studyId: item.studyId, status: 'voting_closed' })}
                        >
                          {t('board.actions.closeVoting')}
                        </button>
                      )}
                      {item.status === 'voting_closed' && (
                        <>
                          <button
                            className="btn-primary btn-sm gap-1"
                            onClick={() => setDecide({ studyId: item.studyId, projectName: item.projectName, kind: 'approved' })}
                          >
                            <CheckCircle2 className="w-3 h-3" /> {t('board.actions.approve')}
                          </button>
                          <button
                            className="btn-secondary btn-sm gap-1 text-red-600"
                            onClick={() => setDecide({ studyId: item.studyId, projectName: item.projectName, kind: 'rejected' })}
                          >
                            <XCircle className="w-3 h-3" /> {t('board.actions.reject')}
                          </button>
                          <button
                            className="btn-secondary btn-sm gap-1"
                            onClick={() => setDecide({ studyId: item.studyId, projectName: item.projectName, kind: 'changes_requested' })}
                          >
                            <FileEdit className="w-3 h-3" /> {t('board.actions.changes')}
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
                <th className="table-header">{t('board.history.colSubject')}</th>
                <th className="table-header">{t('board.history.colDecision')}</th>
                <th className="table-header">{t('board.history.colRationale')}</th>
                <th className="table-header">{t('board.history.colDecidedBy')}</th>
                <th className="table-header">{t('board.history.colWhen')}</th>
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
                  <td className="table-cell text-sm text-gray-500">{formatDatetime(d.decidedAt, locale)}</td>
                </tr>
              ))}
              {(decisions ?? []).length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">{t('board.history.empty')}</td></tr>
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
                <th className="table-header">{t('board.projects.colProject')}</th>
                <th className="table-header">{t('board.projects.colOwnerOrg')}</th>
                <th className="table-header">{t('board.projects.colCategory')}</th>
                <th className="table-header">{t('board.projects.colValue')}</th>
                <th className="table-header">{t('board.projects.colProgress')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(projects?.data || []).map((p: any) => (
                <tr key={p.id}>
                  <td className="table-cell font-medium">{p.block?.translations?.[0]?.name ?? `#${p.id}`}</td>
                  <td className="table-cell">{p.ownerOrganizationId}</td>
                  <td className="table-cell">{p.category}</td>
                  <td className="table-cell">{Number(p.value).toLocaleString(locale)}</td>
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
                {t('board.modal.titleTemplate', {
                  action: decide.kind === 'approved' ? t('board.actions.approve') : decide.kind === 'rejected' ? t('board.actions.reject') : t('board.actions.requestChanges'),
                  name: decide.projectName,
                })}
              </h2>
              <button onClick={() => setDecide(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-500">
              {t('board.modal.description')}
            </p>
            <textarea
              className="input min-h-24 w-full"
              placeholder={t('board.modal.rationalePlaceholder')}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {[
                t('board.rationaleTemplates.routine'),
                t('board.rationaleTemplates.communitySupport'),
                t('board.rationaleTemplates.insufficientDocs'),
              ].map((template) => (
                <button key={template} className="badge bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer" onClick={() => setRationale(template)}>
                  {template.slice(0, 40)}…
                </button>
              ))}
            </div>
            <button
              className="btn-primary btn-md w-full"
              disabled={!rationale.trim() || decideMutation.isPending}
              onClick={() => decideMutation.mutate()}
            >
              {t('board.modal.submit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
