'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Filter, ScrollText, X } from 'lucide-react';
import { auditApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-green-100 text-green-800',
  approved: 'bg-green-100 text-green-800',
  completed: 'bg-green-100 text-green-800',
  pledged: 'bg-blue-100 text-blue-800',
  updated: 'bg-blue-100 text-blue-800',
  published: 'bg-blue-100 text-blue-800',
  opened: 'bg-blue-100 text-blue-800',
  started: 'bg-blue-100 text-blue-800',
  submitted: 'bg-blue-100 text-blue-800',
  cast: 'bg-purple-100 text-purple-800',
  rejected: 'bg-red-100 text-red-800',
  missed: 'bg-red-100 text-red-800',
  failed: 'bg-red-100 text-red-800',
  closed: 'bg-gray-200 text-gray-800',
};

function actionBadge(action: string) {
  const verb = action.split('.')[1] ?? '';
  return ACTION_COLORS[verb] || 'bg-gray-100 text-gray-700';
}

function Snapshot({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</div>
      <pre className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs overflow-x-auto">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditPage() {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<any>(null);

  const isAdministrator = user?.admin?.role === 'administrator';

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, action, subjectType, subjectId, actorUserId, from, to],
    queryFn: () =>
      auditApi.list({
        page,
        limit: 25,
        action: action || undefined,
        subjectType: subjectType || undefined,
        subjectId: subjectId || undefined,
        actorUserId: actorUserId ? Number(actorUserId) : undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
      }),
    enabled: isAdministrator,
  });

  if (!isAdministrator) {
    return (
      <div className="card p-8 text-center text-gray-500">
        {t('audit.adminOnly')}
      </div>
    );
  }

  const logs = data?.data || [];
  const meta = data?.meta || {};

  const resetFilters = () => {
    setAction(''); setSubjectType(''); setSubjectId(''); setActorUserId(''); setFrom(''); setTo(''); setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ScrollText className="w-5 h-5 text-primary-600" />
        <h1 className="text-lg font-semibold">{t('audit.title')}</h1>
        <span className="text-sm text-gray-400">{t('audit.subtitle')}</span>
      </div>

      {/* Filters */}
      <div className="card p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 items-end">
        <div className="col-span-2 lg:col-span-1">
          <label className="text-xs text-gray-500">{t('audit.filterAction')}</label>
          <input className="input" placeholder={t('audit.filterActionPlaceholder')} value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('audit.filterSubjectType')}</label>
          <input className="input" placeholder="project" value={subjectType}
            onChange={(e) => { setSubjectType(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('audit.filterSubjectId')}</label>
          <input className="input" value={subjectId}
            onChange={(e) => { setSubjectId(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('audit.filterActorUserId')}</label>
          <input className="input" type="number" value={actorUserId}
            onChange={(e) => { setActorUserId(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('audit.filterFrom')}</label>
          <input className="input" type="date" value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('audit.filterTo')}</label>
          <input className="input" type="date" value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <button onClick={resetFilters} className="btn-secondary btn-md gap-2">
          <Filter className="w-4 h-4" /> {t('audit.reset')}
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{t('audit.colIndex')}</th>
                <th className="table-header">{t('audit.colTimestamp')}</th>
                <th className="table-header">{t('audit.colAction')}</th>
                <th className="table-header">{t('audit.colSubject')}</th>
                <th className="table-header">{t('audit.colActorUser')}</th>
                <th className="table-header">{t('audit.colRequestId')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr><td colSpan={6} className="p-6 text-center text-gray-400">{t('audit.loading')}</td></tr>
              )}
              {!isLoading && logs.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-gray-400">{t('audit.noEntries')}</td></tr>
              )}
              {logs.map((log: any) => (
                <tr
                  key={log.id}
                  onClick={() => setSelected(log)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <td className="table-cell text-gray-400">{log.id}</td>
                  <td className="table-cell whitespace-nowrap">{new Date(log.timestamp).toLocaleString(locale)}</td>
                  <td className="table-cell">
                    <span className={cn('badge', actionBadge(log.action))}>{log.action}</span>
                  </td>
                  <td className="table-cell">{log.subjectType} #{log.subjectId}</td>
                  <td className="table-cell">{log.actorUserId ?? <span className="text-gray-400">{t('audit.system')}</span>}</td>
                  <td className="table-cell font-mono text-xs text-gray-500 max-w-[180px] truncate">{log.requestId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <span className="text-sm text-gray-500">
            {t('audit.entriesSummary', { total: meta.total ?? 0, page: meta.page ?? 1, totalPages: meta.totalPages ?? 1 })}
          </span>
          <div className="flex gap-2">
            <button
              disabled={!meta.hasPreviousPage}
              onClick={() => setPage((p) => p - 1)}
              className="btn-secondary btn-sm disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={!meta.hasNextPage}
              onClick={() => setPage((p) => p + 1)}
              className="btn-secondary btn-sm disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-lg h-full bg-white dark:bg-gray-900 shadow-xl overflow-y-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('audit.entryTitle', { id: selected.id })}</h2>
              <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-gray-500">{t('audit.colAction')}</div><span className={cn('badge', actionBadge(selected.action))}>{selected.action}</span></div>
              <div><div className="text-xs text-gray-500">{t('audit.colTimestamp')}</div>{new Date(selected.timestamp).toLocaleString(locale)}</div>
              <div><div className="text-xs text-gray-500">{t('audit.colSubject')}</div>{selected.subjectType} #{selected.subjectId}</div>
              <div><div className="text-xs text-gray-500">{t('audit.actorUserId')}</div>{selected.actorUserId ?? t('audit.systemOrAnonymous')}</div>
              <div><div className="text-xs text-gray-500">{t('audit.ip')}</div>{selected.ip ?? '—'}</div>
              <div className="col-span-2"><div className="text-xs text-gray-500">{t('audit.requestId')}</div><span className="font-mono text-xs">{selected.requestId}</span></div>
            </div>

            <Snapshot label={t('audit.before')} value={selected.before} />
            <Snapshot label={t('audit.after')} value={selected.after} />
          </div>
        </div>
      )}
    </div>
  );
}
