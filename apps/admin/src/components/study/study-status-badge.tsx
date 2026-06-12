'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

export const STUDY_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  in_review: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  published: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  voting_open: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  voting_closed: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
  approved: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  rejected: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};

interface Props {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

export function StudyStatusBadge({ status, size = 'md' }: Props) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        STUDY_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600',
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-2.5 py-1 text-xs',
        size === 'lg' && 'px-3 py-1.5 text-sm',
      )}
    >
      {t(`studies.statusLabels.${status}`) || status}
    </span>
  );
}
