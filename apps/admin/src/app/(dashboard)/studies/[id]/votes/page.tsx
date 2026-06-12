'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Download, Filter } from 'lucide-react';
import { votingApi, studiesApi } from '@/lib/api';
import { formatDatetime, cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';

const CHOICE_STYLES: Record<string, string> = {
  for: 'bg-green-100 text-green-700',
  against: 'bg-red-100 text-red-700',
  abstain: 'bg-gray-100 text-gray-600',
};

function ChoiceBadge({ choice }: { choice: string }) {
  const { t } = useLanguage();
  return (
    <span className={cn('badge text-xs capitalize', CHOICE_STYLES[choice] ?? 'bg-gray-100 text-gray-600')}>
      {t(`studies.choices.${choice}`) || choice}
    </span>
  );
}

function voterName(v: any): string {
  if (v.user?.admin) return `${v.user.admin.firstName ?? ''} ${v.user.admin.lastName ?? ''}`.trim();
  if (v.user?.participant) return `${v.user.participant.firstName ?? ''} ${v.user.participant.lastName ?? ''}`.trim();
  return v.user?.email ?? '—';
}

function voterRole(v: any): string {
  if (v.user?.admin) return v.user.admin.role?.replace(/_/g, ' ') ?? 'admin';
  if (v.user?.participant) return 'participant';
  return '—';
}

function exportToCsv(votes: any[], studyId: number) {
  const headers = ['Voter Name', 'Role', 'Choice', 'Comment', 'Date'];
  const rows = votes.map((v) => [
    voterName(v),
    voterRole(v),
    v.choice,
    (v.comment ?? '').replace(/"/g, '""'),
    v.createdAt ? new Date(v.createdAt).toISOString() : '',
  ]);

  const csvContent =
    [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `votes-study-${studyId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VoteAuditLogPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const { user } = useAuth();
  const { t } = useLanguage();
  const role = user?.admin?.role || '';
  const isAdmin = role === 'administrator';

  const [choiceFilter, setChoiceFilter] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data: study } = useQuery({
    queryKey: ['study', id],
    queryFn: () => studiesApi.get(id),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['votes', id, choiceFilter, page],
    queryFn: () =>
      votingApi.listVotes(id, {
        choice: choiceFilter || undefined,
        page,
      }),
    enabled: isAdmin,
  });

  const votes: any[] = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, lastPage: 1 };

  const handleExport = useCallback(async () => {
    const all = await votingApi.listVotes(id, { choice: choiceFilter || undefined, page: 1 });
    const allVotes = all?.data ?? [];
    exportToCsv(allVotes, id);
  }, [id, choiceFilter]);

  if (!isAdmin) {
    return (
      <div className="py-20 text-center text-gray-400">
        {t('studies.accessRestricted')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/studies/${id}`}
            className="btn-ghost btn-sm p-1.5 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="page-title">{t('studies.auditLog.title')}</h1>
            {study && (
              <p className="text-sm text-gray-400 mt-0.5">{t('studies.auditLog.study')}{id}</p>
            )}
          </div>
        </div>

        <button
          onClick={handleExport}
          className="btn-secondary btn-md gap-2"
          disabled={votes.length === 0}
        >
          <Download className="w-4 h-4" />
          {t('studies.auditLog.exportCsv')}
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex items-center gap-3">
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <label className="text-sm text-gray-600">{t('studies.auditLog.filterByChoice')}</label>
        <select
          value={choiceFilter}
          onChange={(e) => {
            setChoiceFilter(e.target.value);
            setPage(1);
          }}
          className="input input-sm w-36"
        >
          <option value="">{t('studies.auditLog.all')}</option>
          <option value="for">{t('studies.choices.for')}</option>
          <option value="against">{t('studies.choices.against')}</option>
          <option value="abstain">{t('studies.choices.abstain')}</option>
        </select>
        {meta.total > 0 && (
          <span className="text-xs text-gray-400 ml-auto">
            {meta.total} {meta.total !== 1 ? t('studies.votes_') : t('studies.vote')}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">{t('studies.auditLog.loading')}</div>
        ) : votes.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">{t('studies.auditLog.noVotes')}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left">
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('studies.auditLog.colVoter')}</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('studies.auditLog.colRole')}</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('studies.auditLog.colChoice')}</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('studies.auditLog.colComment')}</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('studies.auditLog.colDate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {votes.map((v: any) => (
                    <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {voterName(v)}
                      </td>
                      <td className="px-5 py-3 text-gray-500 capitalize">
                        {voterRole(v)}
                      </td>
                      <td className="px-5 py-3">
                        <ChoiceBadge choice={v.choice} />
                      </td>
                      <td className="px-5 py-3 text-gray-500 max-w-xs">
                        <span className="line-clamp-2">
                          {v.comment || <span className="italic text-gray-300">—</span>}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-400 whitespace-nowrap text-xs">
                        {v.createdAt ? formatDatetime(v.createdAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta.lastPage > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-ghost btn-sm disabled:opacity-40"
                >
                  {t('studies.auditLog.previous')}
                </button>
                <span className="text-xs text-gray-500">
                  {t('studies.auditLog.page')} {page} {t('studies.auditLog.of')} {meta.lastPage}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(meta.lastPage, p + 1))}
                  disabled={page === meta.lastPage}
                  className="btn-ghost btn-sm disabled:opacity-40"
                >
                  {t('studies.auditLog.next')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
