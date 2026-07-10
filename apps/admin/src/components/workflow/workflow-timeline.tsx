'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDot, GitBranch, Lock } from 'lucide-react';
import { studiesApi, workflowApi } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { cn, formatDatetime } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

/**
 * W4-E5-S1 — the project's lifecycle as the engine sees it: current state,
 * step-log timeline, and action buttons rendered from `availableTransitions`
 * (allowed ones execute through the owning service's endpoint; denied ones
 * show the guard's reason). Works in both workspaces.
 */

/** engine action → legacy study-status endpoint payload (bridge era) */
const ACTION_TO_STATUS: Record<string, string> = {
  submit: 'in_review',
  revise: 'draft',
  publish: 'published',
  open_voting: 'voting_open',
  extend_voting: 'voting_open',
  close_voting: 'voting_closed',
  reopen_review: 'in_review',
  approve: 'approved',
  reject: 'rejected',
};
/** system/derived transitions have no manual button */
const HIDDEN_ACTIONS = new Set(['open_donations', 'complete', 'begin_execution', 'request_changes']);

const STATE_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  in_review: 'bg-yellow-100 text-yellow-800',
  published: 'bg-blue-100 text-blue-700',
  voting_open: 'bg-blue-100 text-blue-700',
  voting_closed: 'bg-purple-100 text-purple-700',
  approved: 'bg-green-100 text-green-800',
  donations_open: 'bg-emerald-100 text-emerald-800',
  executing: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};

export function WorkflowTimeline({ projectId, studyId }: { projectId: number; studyId?: number | null }) {
  const { locale } = useLanguage();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();

  const { data: instance, isError } = useQuery({
    queryKey: ['workflow-instance', projectId],
    queryFn: () => workflowApi.projectInstance(projectId),
    retry: false,
  });

  const actionMutation = useMutation({
    mutationFn: (action: string) => {
      const status = ACTION_TO_STATUS[action];
      const extra =
        action === 'open_voting'
          ? { votingEndsAt: new Date(Date.now() + 7 * 86400000).toISOString() }
          : undefined;
      return studiesApi.changeStatus(studyId!, status, undefined, extra);
    },
    onSuccess: () => {
      success('Transition executed');
      qc.invalidateQueries({ queryKey: ['workflow-instance', projectId] });
      qc.invalidateQueries();
    },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Transition failed'),
  });

  if (isError || !instance) return null;

  const actions = (instance.availableTransitions ?? []).filter((t: any) => !HIDDEN_ACTIONS.has(t.actionKey));

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary-600" />
          Lifecycle
          <span className="text-xs text-gray-400 font-normal">
            {instance.definition?.key} v{instance.definition?.version}
          </span>
        </h3>
        <span className={cn('badge', STATE_BADGE[instance.currentStateKey] ?? 'bg-gray-100 text-gray-500')}>
          {instance.currentStateKey}
        </span>
      </div>

      {/* Actions from availableTransitions */}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((t: any) =>
            t.allowed && studyId && ACTION_TO_STATUS[t.actionKey] ? (
              <button
                key={t.actionKey}
                className="btn-secondary btn-sm"
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate(t.actionKey)}
                title={`→ ${t.toStateKey}`}
              >
                {t.actionKey.replace(/_/g, ' ')}
              </button>
            ) : (
              <span
                key={t.actionKey}
                className="badge bg-gray-100 text-gray-400 gap-1"
                title={t.deniedBy ?? 'not available here'}
              >
                <Lock className="w-3 h-3" /> {t.actionKey.replace(/_/g, ' ')}
              </span>
            ),
          )}
        </div>
      )}

      {/* Step-log timeline */}
      <ol className="space-y-1.5">
        {(instance.stepLogs ?? []).map((step: any) => (
          <li key={step.id} className="flex items-center gap-2 text-sm">
            <CircleDot className="w-3 h-3 text-primary-500 flex-shrink-0" />
            <span className="font-medium">{step.actionKey.replace(/_/g, ' ')}</span>
            <span className="text-gray-400 text-xs">
              {step.fromStateKey ? `${step.fromStateKey} → ` : ''}{step.toStateKey}
            </span>
            <span className="text-gray-400 text-xs ms-auto">{formatDatetime(step.createdAt, locale)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
