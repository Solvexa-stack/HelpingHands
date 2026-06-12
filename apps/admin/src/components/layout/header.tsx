'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Bell, LogOut, ExternalLink, Sun, Moon, CheckCheck } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useLanguage, type Locale } from '@/contexts/language-context';
import { notificationsApi } from '@/lib/api';
import { formatDatetime, cn } from '@/lib/utils';

const pageTitleKeys: Record<string, string> = {
  '/dashboard': 'nav.dashboard',
  '/donations': 'nav.donations',
  '/projects': 'nav.projects',
  '/participants': 'nav.participants',
  '/employees': 'nav.employees',
  '/content/blogs': 'nav.blogs',
  '/content/news': 'nav.news',
  '/content/events': 'nav.events',
  '/content/about': 'nav.about',
  '/languages': 'nav.languages',
  '/studies': 'nav.studies',
};

function notificationLink(n: any): string | null {
  if (!n.referenceId) return null;
  if (n.referenceType === 'study') return `/studies/${n.referenceId}`;
  if (n.referenceType === 'project') return `/projects/${n.referenceId}`;
  return null;
}

export function Header() {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { locale, setLocale, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const titleKey = Object.entries(pageTitleKeys).find(([key]) => pathname.startsWith(key))?.[1] || '';
  const title = titleKey ? t(titleKey) : t('header.adminTitle');

  // ── Unread count (poll every 60s) ──
  const { data: countData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 60_000,
  });
  const unread: number = countData?.count ?? 0;

  // ── Notifications list (fetched when dropdown opens) ──
  const { data: notifData } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: () => notificationsApi.getMyNotifications(1),
    enabled: open,
  });
  const notifications: any[] = notifData?.data ?? [];

  // ── Mark all read ──
  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      qc.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  // ── Mark single read ──
  const markOneMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      qc.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</h1>

      <div className="flex items-center gap-2">
        {/* Language switcher */}
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="en">EN</option>
          <option value="ar">AR</option>
          <option value="fr">FR</option>
        </select>

        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          className="btn-ghost btn-sm text-gray-500"
          title={theme === 'dark' ? t('header.switchToLight') : t('header.switchToDark')}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notification bell */}
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
              {/* Header row */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{t('header.notifications')}</h3>
                {unread > 0 && (
                  <span className="badge bg-red-100 text-red-600 text-xs">{unread} {t('header.new')}</span>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                {notifications.length === 0 ? (
                  <p className="text-center py-8 text-sm text-gray-400">{t('header.noNotifications')}</p>
                ) : (
                  notifications.slice(0, 10).map((n: any) => {
                    const link = notificationLink(n);
                    const isUnread = !n.isRead;
                    const inner = (
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
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                          )}
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
                    );
                    return <div key={n.id}>{inner}</div>;
                  })
                )}
              </div>

              {/* Footer */}
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

        <a
          href={process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost btn-sm text-gray-500"
        >
          <ExternalLink className="w-4 h-4" />
          <span className="hidden sm:inline">{t('header.viewSite')}</span>
        </a>

        <button
          onClick={handleLogout}
          className="btn-ghost btn-sm text-gray-500 hover:text-red-600 hover:bg-red-50"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">{t('header.logout')}</span>
        </button>
      </div>
    </header>
  );
}
