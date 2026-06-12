'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ThumbsUp, ThumbsDown, Minus, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { votingApi } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

type Choice = 'for' | 'against' | 'abstain';

interface VoteFormProps {
  studyId: number;
  studyStatus: string;
  votingStartsAt?: string | null;
  votingEndsAt?: string | null;
}

const CHOICE_CONFIG: { value: Choice; labelKey: string; icon: typeof ThumbsUp; color: string }[] = [
  { value: 'for', labelKey: 'for', icon: ThumbsUp, color: 'border-green-400 text-green-700 bg-green-50 hover:bg-green-100' },
  { value: 'against', labelKey: 'against', icon: ThumbsDown, color: 'border-red-400 text-red-700 bg-red-50 hover:bg-red-100' },
  { value: 'abstain', labelKey: 'abstain', icon: Minus, color: 'border-gray-400 text-gray-700 bg-gray-50 hover:bg-gray-100' },
];

export function VoteForm({ studyId, studyStatus, votingStartsAt, votingEndsAt }: VoteFormProps) {
  const t = useTranslations('study.vote');
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [choice, setChoice] = useState<Choice | null>(null);
  const [comment, setComment] = useState('');
  const [toast, setToast] = useState('');

  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ['vote-results', studyId],
    queryFn: () => votingApi.getResults(studyId),
    enabled: ['voting_open', 'voting_closed', 'approved', 'rejected'].includes(studyStatus),
  });

  const myVote: Choice | null = resultsData?.myVote ?? null;
  const isVotingOpen = studyStatus === 'voting_open';
  const hasVoted = !!myVote;

  const castMutation = useMutation({
    mutationFn: () => votingApi.castVote({ studyId, choice: choice!, comment: comment || undefined }),
    onSuccess: () => {
      setToast(t('submitted'));
      setChoice(null);
      setComment('');
      qc.invalidateQueries({ queryKey: ['vote-results', studyId] });
    },
    onError: (err: any) => setToast(err?.response?.data?.message || 'Failed to submit vote'),
  });

  const changeMutation = useMutation({
    mutationFn: () => votingApi.changeVote(studyId, { choice: choice!, comment: comment || undefined }),
    onSuccess: () => {
      setToast(t('changed'));
      setChoice(null);
      setComment('');
      qc.invalidateQueries({ queryKey: ['vote-results', studyId] });
    },
    onError: (err: any) => setToast(err?.response?.data?.message || 'Failed to update vote'),
  });

  if (authLoading) return null;

  if (!user) {
    return (
      <div className="text-center py-6">
        <button
          onClick={() => router.push(`/${locale}/auth/login?redirect=/projects/`)}
          className="btn-primary"
        >
          {t('loginToVote')}
        </button>
      </div>
    );
  }

  if (!isVotingOpen) {
    if (studyStatus === 'published' && votingStartsAt) {
      return (
        <p className="text-gray-500 text-sm">
          {t('votingOpensOn')} {formatDate(votingStartsAt, locale)}
        </p>
      );
    }
    if (['voting_closed', 'approved', 'rejected'].includes(studyStatus)) {
      return <p className="text-gray-500 text-sm">{t('votingClosed')}</p>;
    }
    return <p className="text-gray-500 text-sm">{t('votingNotOpen')}</p>;
  }

  const isChanging = hasVoted && !!choice;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {toast}
        </div>
      )}

      {hasVoted && !choice && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
          {t('yourVote')}:{' '}
          <span className="font-semibold capitalize">{t(myVote as any)}</span>
          <button
            onClick={() => setChoice(myVote)}
            className="ml-3 text-blue-600 hover:underline text-xs"
          >
            {t('change')}
          </button>
        </div>
      )}

      {(!hasVoted || choice) && (
        <>
          <p className="font-medium text-gray-800 text-sm">{t('howDoYouVote')}</p>
          <div className="flex gap-2">
            {CHOICE_CONFIG.map(({ value, labelKey, icon: Icon, color }) => (
              <button
                key={value}
                onClick={() => setChoice(choice === value ? null : value)}
                className={cn(
                  'flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all flex flex-col items-center gap-1',
                  choice === value
                    ? color + ' ring-2 ring-offset-1 ring-current'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white',
                )}
              >
                <Icon className="w-4 h-4" />
                {t(labelKey as any)}
              </button>
            ))}
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-1 block">{t('optionalComment')}</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="input resize-none w-full"
              placeholder="Share your thoughts (optional)..."
            />
          </div>

          <button
            onClick={() => hasVoted ? changeMutation.mutate() : castMutation.mutate()}
            disabled={!choice || castMutation.isPending || changeMutation.isPending}
            className="btn-primary w-full justify-center gap-2 disabled:opacity-50"
          >
            {(castMutation.isPending || changeMutation.isPending) ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            {isChanging ? t('change') : t('submit')}
          </button>
        </>
      )}
    </div>
  );
}
