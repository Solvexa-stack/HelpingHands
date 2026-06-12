'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

interface CountdownTimerProps {
  endsAt: Date;
}

function computeRemaining(endsAt: Date) {
  const diff = endsAt.getTime() - Date.now();
  if (diff <= 0) return null;
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, totalMs: diff };
}

export function CountdownTimer({ endsAt }: CountdownTimerProps) {
  const { t } = useLanguage();
  const [remaining, setRemaining] = useState(() => computeRemaining(endsAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(computeRemaining(endsAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (!remaining) {
    return (
      <span className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
        <Clock className="w-4 h-4" />
        {t('studies.countdown.ended')}
      </span>
    );
  }

  const isUrgent = remaining.totalMs < 2 * 60 * 60 * 1000;

  const parts: string[] = [];
  if (remaining.days > 0)
    parts.push(`${remaining.days} ${remaining.days !== 1 ? t('studies.countdown.days') : t('studies.countdown.day')}`);
  if (remaining.hours > 0 || remaining.days > 0)
    parts.push(`${remaining.hours} ${remaining.hours !== 1 ? t('studies.countdown.hours') : t('studies.countdown.hour')}`);
  parts.push(`${remaining.minutes} ${remaining.minutes !== 1 ? t('studies.countdown.mins') : t('studies.countdown.min')}`);
  if (remaining.days === 0) parts.push(`${remaining.seconds}s`);

  return (
    <span
      className={cn(
        'text-sm font-medium flex items-center gap-1.5',
        isUrgent ? 'text-red-600' : 'text-purple-600',
      )}
    >
      <Clock className="w-4 h-4" />
      {t('studies.countdown.closesIn')} {parts.join(', ')}
    </span>
  );
}
