'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Heart, BookOpen, Vote, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import Link from 'next/link';
import { DonateButton } from '@/components/donations/donate-button';
import { OnlineDonateButton } from '@/components/donations/online-donate-button';
import { cn } from '@/lib/utils';

interface Props {
  projectId: number;
  locale: string;
  studyStatus: string | null;
  isCompleted: boolean;
}

function StudyBanner({ studyStatus, locale, projectId }: { studyStatus: string | null; locale: string; projectId: number }) {
  const ts = useTranslations('study');

  if (!studyStatus) return null;

  if (studyStatus === 'draft' || studyStatus === 'in_review') {
    return (
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>{ts('underReview')}</p>
      </div>
    );
  }

  if (studyStatus === 'published' || studyStatus === 'voting_open') {
    return (
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <Vote className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">{ts('voteOpen')}</p>
          <Link
            href={`/${locale}/projects/${projectId}/study`}
            className="text-blue-600 hover:underline flex items-center gap-1 mt-1"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {ts('readStudy')}
          </Link>
        </div>
      </div>
    );
  }

  if (studyStatus === 'voting_closed') {
    return (
      <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700">
        <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>{ts('votingClosed')}</p>
      </div>
    );
  }

  if (studyStatus === 'rejected') {
    return (
      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
        <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>{ts('rejected')}</p>
      </div>
    );
  }

  return null;
}

export function ProjectDonateSidebar({ projectId, locale, studyStatus, isCompleted }: Props) {
  const tp = useTranslations('payment');
  const [mode, setMode] = useState<'cash' | 'online' | null>(null);
  const canDonate = studyStatus === 'approved' || studyStatus === null;

  return (
    <div className="card p-6 sticky top-24 space-y-4">
      <StudyBanner studyStatus={studyStatus} locale={locale} projectId={projectId} />

      {!isCompleted && (
        <>
          {canDonate ? (
            <>
              {/* Provider selector */}
              <div className="flex gap-2">
                <button
                  onClick={() => setMode(mode === 'cash' ? null : 'cash')}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors flex items-center justify-center gap-1.5',
                    mode === 'cash'
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <Heart className="w-4 h-4" />
                  {tp('donateCash')}
                </button>
                <button
                  onClick={() => setMode(mode === 'online' ? null : 'online')}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors flex items-center justify-center gap-1.5',
                    mode === 'online'
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <span className="text-base">💳</span>
                  {tp('donateOnline')}
                </button>
              </div>

              {mode === 'cash' && (
                <DonateButton projectId={projectId} locale={locale} />
              )}
              {mode === 'online' && (
                <OnlineDonateButton projectId={projectId} />
              )}
              {mode === null && (
                <p className="text-sm text-gray-400 text-center">Select a donation method above</p>
              )}
            </>
          ) : (
            <div className="text-center py-3">
              <p className="text-sm text-gray-500 italic">
                Donations open after study approval
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
