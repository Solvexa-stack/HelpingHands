'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Search, Eye } from 'lucide-react';
import { studiesApi } from '@/lib/api';
import { formatDate, getTranslation, cn } from '@/lib/utils';
import { StudyStatusBadge } from '@/components/study/study-status-badge';
import { useLanguage } from '@/contexts/language-context';

const STUDY_STATUSES = ['', 'draft', 'in_review', 'published', 'voting_open', 'voting_closed', 'approved', 'rejected'];

function SectionsProgress({ count, t }: { count: number; t: (k: string) => string }) {
  return (
    <span className="text-sm text-gray-600">
      {count} {count !== 1 ? t('studies.sections') : t('studies.section')}
    </span>
  );
}

function VoteCell({ votes, t }: { votes: number; t: (k: string) => string }) {
  if (!votes) return <span className="text-gray-400 text-sm">—</span>;
  return (
    <span className="text-sm text-gray-700">
      {votes} {votes !== 1 ? t('studies.votes_') : t('studies.vote')}
    </span>
  );
}

export default function StudiesPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-studies', search, status, page],
    queryFn: () =>
      studiesApi.list({ status: status || undefined, page, limit: 20 }),
  });

  const studies = data?.data || [];
  const meta = data?.meta || {};

  const filtered = search
    ? studies.filter((s: any) => {
        const name = getTranslation(s.project?.block?.translations || [])?.name || '';
        return name.toLowerCase().includes(search.toLowerCase());
      })
    : studies;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
            placeholder={t('studies.searchPlaceholder')}
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="input w-44"
        >
          <option value="">{t('studies.allStatuses')}</option>
          {STUDY_STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>{t(`studies.statusLabels.${s}`)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{t('studies.colProject')}</th>
                <th className="table-header">{t('studies.colCategory')}</th>
                <th className="table-header">{t('studies.colStatus')}</th>
                <th className="table-header">{t('studies.colSections')}</th>
                <th className="table-header">{t('studies.colVotes')}</th>
                <th className="table-header">{t('studies.colCreated')}</th>
                <th className="table-header">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={7} className="table-cell text-center py-12 text-gray-400">{t('common.loading')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="table-cell text-center py-12 text-gray-400">{t('studies.noData')}</td></tr>
              ) : (
                filtered.map((s: any) => {
                  const projectName = getTranslation(s.project?.block?.translations || [])?.name || `Project #${s.projectId}`;
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <Link href={`/projects/${s.projectId}`} className="font-medium hover:text-primary-600 transition-colors max-w-52 truncate block">
                          {projectName}
                        </Link>
                      </td>
                      <td className="table-cell">
                        <span className="badge bg-gray-100 text-gray-600 capitalize">
                          {s.project?.category || '—'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <StudyStatusBadge status={s.status} />
                      </td>
                      <td className="table-cell">
                        <SectionsProgress count={s._count?.sections ?? 0} t={t} />
                      </td>
                      <td className="table-cell">
                        <VoteCell votes={s._count?.votes ?? 0} t={t} />
                      </td>
                      <td className="table-cell text-gray-400 text-sm">{formatDate(s.createdAt)}</td>
                      <td className="table-cell">
                        <Link
                          href={`/studies/${s.id}`}
                          className="btn-ghost btn-sm p-1.5 rounded-lg text-gray-500 hover:text-primary-600"
                          title={t('studies.overview')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {meta?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">{meta.total} {t('common.total').toLowerCase()}</p>
            <div className="flex gap-1">
              {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={cn('w-8 h-8 rounded-lg text-sm font-medium transition-colors', pg === page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100')}
                >
                  {pg}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
