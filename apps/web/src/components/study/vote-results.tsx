'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { votingApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface VoteResultsProps {
  studyId: number;
  studyStatus: string;
}

export function VoteResults({ studyId, studyStatus }: VoteResultsProps) {
  const t = useTranslations('study');
  const showResults = ['voting_open', 'voting_closed', 'approved', 'rejected'].includes(studyStatus);

  const { data, isLoading } = useQuery({
    queryKey: ['vote-results', studyId],
    queryFn: () => votingApi.getResults(studyId),
    enabled: showResults,
    refetchInterval: studyStatus === 'voting_open' ? 30_000 : false,
  });

  if (!showResults) return null;
  if (isLoading) return <div className="text-sm text-gray-400 text-center py-4">Loading results…</div>;

  const total = data?.total ?? 0;
  const forCount = data?.for?.count ?? 0;
  const againstCount = data?.against?.count ?? 0;
  const abstainCount = data?.abstain?.count ?? 0;

  if (total === 0) {
    return <p className="text-sm text-gray-400 py-2">{t('noVotes')}</p>;
  }

  const pct = (n: number) => total > 0 ? ((n / total) * 100).toFixed(1) : '0';

  const rows = [
    { label: t('vote.for'), value: forCount, color: 'bg-green-500' },
    { label: t('vote.against'), value: againstCount, color: 'bg-red-500' },
    { label: t('vote.abstain'), value: abstainCount, color: 'bg-gray-400' },
  ];

  return (
    <div className="space-y-3">
      {rows.map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-sm text-gray-600 w-16 flex-shrink-0">{label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', color)}
              style={{ width: `${pct(value)}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-gray-900 w-12 text-end">{pct(value)}%</span>
          <span className="text-xs text-gray-400 w-8 text-end">{value}</span>
        </div>
      ))}
      <p className="text-xs text-gray-400 pt-1">Total: {total} votes</p>
    </div>
  );
}
