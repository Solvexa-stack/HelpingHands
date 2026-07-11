'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, GitBranch, X } from 'lucide-react';
import { workflowApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

/**
 * W4-E5-S2 — read-only definition viewer: definitions/versions with their
 * state-transition graph (states as chips, transitions as a from→action→to
 * table with guard and effect summaries).
 */

const KIND_BADGE: Record<string, string> = {
  initial: 'bg-blue-100 text-blue-700',
  normal: 'bg-gray-100 text-gray-600',
  terminal: 'bg-green-100 text-green-800',
};

function guardSummary(guards: any[]): string {
  if (!guards?.length) return '—';
  return guards
    .map((g) => {
      if (g.type === 'role') return `role: ${g.anyOf.map((r: any) => `${r.scope}[${r.roles.join('|')}]`).join(' or ')}`;
      if (g.type === 'board_decision') return `board decision: ${g.decision}`;
      if (g.type === 'capability') return `capability: ${g.cap}`;
      return g.type;
    })
    .join(' + ');
}

export default function WorkflowDefinitionsPage() {
  const { t } = useLanguage();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: definitions } = useQuery({ queryKey: ['workflow-definitions'], queryFn: () => workflowApi.definitions() });
  const { data: detail } = useQuery({
    queryKey: ['workflow-definition', selectedId],
    queryFn: () => workflowApi.definition(selectedId!),
    enabled: selectedId != null,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <GitBranch className="w-5 h-5 text-primary-600" />
        <h1 className="text-lg font-semibold">{t('workflowDefinitions.title')}</h1>
        <span className="text-sm text-gray-400">{t('workflowDefinitions.subtitle')}</span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">{t('workflowDefinitions.colKey')}</th>
              <th className="table-header">{t('workflowDefinitions.colVersion')}</th>
              <th className="table-header">{t('workflowDefinitions.colSubject')}</th>
              <th className="table-header">{t('workflowDefinitions.colStatus')}</th>
              <th className="table-header">{t('workflowDefinitions.colInstances')}</th>
              <th className="table-header">{t('workflowDefinitions.colDescription')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(definitions ?? []).map((d: any) => (
              <tr key={d.id} onClick={() => setSelectedId(d.id)} className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <td className="table-cell font-medium">{d.key}</td>
                <td className="table-cell">v{d.version}</td>
                <td className="table-cell">{d.subjectType}</td>
                <td className="table-cell">
                  <span className={cn('badge', d.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500')}>
                    {d.isActive ? t('workflowDefinitions.active') : t('workflowDefinitions.inactive')}
                  </span>
                </td>
                <td className="table-cell">{d._count?.instances ?? 0}</td>
                <td className="table-cell text-sm text-gray-500 max-w-md truncate" title={d.description}>{d.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail drawer: states + transition graph */}
      {selectedId != null && detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedId(null)}>
          <div className="w-full max-w-2xl h-full bg-white dark:bg-gray-900 shadow-xl overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <GitBranch className="w-4 h-4" /> {detail.key} v{detail.version}
                <span className={cn('badge', detail.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500')}>
                  {detail.isActive ? t('workflowDefinitions.active') : t('workflowDefinitions.inactive')}
                </span>
              </h2>
              <button onClick={() => setSelectedId(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-500">{detail.description}</p>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">{t('workflowDefinitions.statesLabel')}</div>
              <div className="flex flex-wrap gap-2">
                {detail.states.map((s: any) => (
                  <span key={s.id} className={cn('badge', KIND_BADGE[s.kind] ?? 'bg-gray-100 text-gray-600')} title={s.kind}>
                    {s.key}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">{t('workflowDefinitions.transitionsLabel')}</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">{t('workflowDefinitions.colFrom')}</th>
                    <th className="table-header"></th>
                    <th className="table-header">{t('workflowDefinitions.colTo')}</th>
                    <th className="table-header">{t('workflowDefinitions.colAction')}</th>
                    <th className="table-header">{t('workflowDefinitions.colGuards')}</th>
                    <th className="table-header">{t('workflowDefinitions.colEffects')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.transitions.map((tr: any) => (
                    <tr key={tr.id}>
                      <td className="table-cell">{tr.fromStateKey}</td>
                      <td className="table-cell"><ArrowRight className="w-3 h-3 text-gray-400" /></td>
                      <td className="table-cell">{tr.toStateKey}</td>
                      <td className="table-cell font-medium">{tr.actionKey}</td>
                      <td className="table-cell text-xs text-gray-500">{guardSummary(tr.guards)}</td>
                      <td className="table-cell text-xs text-gray-500">{(tr.effects ?? []).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
