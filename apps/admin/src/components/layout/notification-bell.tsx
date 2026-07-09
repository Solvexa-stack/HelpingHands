'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/language-context';
import { notificationsApi } from '@/lib/api';
import { formatDatetime, cn } from '@/lib/utils';

function notificationLink(n: any, base: string): string | null {
  if (!n.referenceId) return null;
  if (n.referenceType === 'study') return `${base}/studies/${n.referenceId}`;
  if (n.referenceType === 'project') return `${base}/projects/${n.referenceId}`;
  return null;
}

/**
 * Notification dropdown shared by the platform and organization workspace
 * headers. `linkBase` prefixes reference links so each workspace stays inside
 * its own routing space ('' for platform, '/org' for organization).
 */
export function NotificationBell({ linkBase = '' }: { linkBase?: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const qc = useQueryClient();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const { data: countData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 60_000,
  });
  const unread: number = countData?.count ?? 0;

  const { data: notifData } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: () => notificationsApi.getMyNotifications(1),
    enabled: open,
  });
  const notifications: any[] = notifData?.data ?? [];

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      qc.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const markOneMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      qc.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn('btn-ghost btn-sm text-gray-500 relative', open && 'bg-gray-100 dark:bg-gray-800')}
        title={t('header.notifications')}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{t('header.notifications')}</h3>
            {unread > 0 && (
              <span className="badge bg-red-100 text-red-600 text-xs">{unread} {t('header.new')}</span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
            {notifications.length === 0 ? (
              <p className="text-center py-8 text-sm text-gray-400">{t('header.noNotifications')}</p>
            ) : (
              notifications.slice(0, 10).map((n: any) => {
                const link = notificationLink(n, linkBase);
                const isUnread = !n.isRead;
                return (
                  <div key={n.id}>
                    <div
                      className={cn(
                        'px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer',
                        isUnread && 'bg-blue-50 dark:bg-blue-950/30',
                      )}
                      onClick={() => {
                        if (isUnread) markOneMutation.mutate(n.id);
                        if (link) {
                          router.push(link);
                          setOpen(false);
                        }
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />}
                        <div className={cn('flex-1 min-w-0', !isUnread && 'pl-4')}>
                          <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug line-clamp-2">
                            {n.title || n.type?.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {n.createdAt ? formatDatetime(n.createdAt) : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => markAllMutation.mutate()}
              disabled={unread === 0 || markAllMutation.isPending}
              className="btn-ghost btn-sm w-full justify-center gap-1.5 text-xs disabled:opacity-40"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {t('header.markAllRead')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
