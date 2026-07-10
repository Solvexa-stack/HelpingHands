'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Heart, User, QrCode, ArrowRight, CheckCircle, Clock, XCircle,
  Vote, CreditCard, Bell, CheckCheck, ExternalLink, Printer,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { donationsApi, votingApi, paymentsApi, notificationsApi } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor, getTranslation, cn } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/progress-bar';

type Tab = 'donations' | 'votes' | 'online';

// ── Notification Bell ─────────────────────────────────────────────────────────
function NotificationBell() {
  const tNotif = useTranslations('dashboard.notifications');
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const { data: countData } = useQuery({
    queryKey: ['notif-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 60_000,
  });
  const unread: number = countData?.count ?? 0;

  const { data: notifData } = useQuery({
    queryKey: ['notif-list'],
    queryFn: () => notificationsApi.getMyNotifications(1),
    enabled: open,
  });
  const notifications: any[] = notifData?.data ?? [];

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      qc.invalidateQueries({ queryKey: ['notif-list'] });
    },
  });

  const markOneMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      qc.invalidateQueries({ queryKey: ['notif-list'] });
    },
  });

  function notifLink(n: any): string | null {
    if (!n.referenceId) return null;
    if (n.referenceType === 'study') return `/${locale}/projects`;
    if (n.referenceType === 'project') return `/${locale}/projects/${n.referenceId}`;
    return null;
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">{tNotif('title')}</h3>
            {unread > 0 && <span className="badge bg-red-100 text-red-600 text-xs">{tNotif('newCount', { count: unread })}</span>}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <p className="text-center py-6 text-sm text-gray-400">{tNotif('empty')}</p>
            ) : (
              notifications.slice(0, 10).map((n: any) => {
                const link = notifLink(n);
                const isUnread = !n.isRead;
                return (
                  <div
                    key={n.id}
                    className={cn('px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors', isUnread && 'bg-blue-50')}
                    onClick={() => {
                      if (isUnread) markOneMutation.mutate(n.id);
                      if (link) { router.push(link); setOpen(false); }
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />}
                      <div className={cn('flex-1 min-w-0', !isUnread && 'pl-4')}>
                        <p className="text-sm text-gray-800 line-clamp-2">{n.title || n.type?.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{n.createdAt ? formatDate(n.createdAt, locale) : ''}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-100">
            <button
              onClick={() => markAllMutation.mutate()}
              disabled={unread === 0 || markAllMutation.isPending}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 py-1"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {tNotif('markAllRead')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Provider badge ─────────────────────────────────────────────────────────────
function ProviderBadge({ provider }: { provider: string }) {
  if (provider === 'stripe') {
    return <span className="badge bg-indigo-100 text-indigo-700 text-xs">Stripe</span>;
  }
  return <span className="badge bg-blue-100 text-blue-700 text-xs">PayPal</span>;
}

// ── Vote choice badge ──────────────────────────────────────────────────────────
function VoteBadge({ choice }: { choice: string }) {
  const map: Record<string, string> = {
    for: 'bg-green-100 text-green-700',
    against: 'bg-red-100 text-red-700',
    abstain: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={cn('badge capitalize text-xs', map[choice] ?? 'bg-gray-100 text-gray-600')}>
      {choice}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, loading } = useAuth();
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('donations');

  useEffect(() => {
    if (!loading && !user) router.replace(`/${locale}/auth/login?redirect=/dashboard`);
  }, [user, loading, router, locale]);

  const { data: donationsData, isLoading: donationsLoading } = useQuery({
    queryKey: ['my-donations'],
    queryFn: () => donationsApi.list({ limit: 20 }),
    enabled: !!user && tab === 'donations',
  });

  const { data: onlineData, isLoading: onlineLoading } = useQuery({
    queryKey: ['my-online-donations'],
    queryFn: () => paymentsApi.listDonations({ limit: 20 }),
    enabled: !!user && tab === 'online',
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return null;

  const donations = donationsData?.data || [];
  const onlineDonations = onlineData?.data || [];
  const name = user.participant?.firstName || user.admin?.firstName || '';
  const email = user.email || '';

  const statsCards = [
    {
      label: t('stats.totalDonations'),
      value: donations.length,
      icon: Heart,
      color: 'text-rose-500 bg-rose-50',
    },
    {
      label: t('status.approved'),
      value: donations.filter((d: any) => d.status === 'approved').length,
      icon: CheckCircle,
      color: 'text-green-500 bg-green-50',
    },
    {
      label: t('status.pending'),
      value: donations.filter((d: any) => d.status === 'pending').length,
      icon: Clock,
      color: 'text-yellow-500 bg-yellow-50',
    },
    {
      label: t('stats.totalContributed'),
      value: formatCurrency(
        donations.filter((d: any) => d.status === 'approved').reduce((sum: number, d: any) => sum + Number(d.amount), 0),
      ),
      icon: ArrowRight,
      color: 'text-primary-500 bg-primary-50',
    },
  ];

  const tabs = [
    { id: 'donations' as Tab, label: t('donations'), icon: Heart },
    { id: 'votes' as Tab, label: t('votesTab'), icon: Vote },
    { id: 'online' as Tab, label: t('onlineTab'), icon: CreditCard },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">{t('welcome', { name })}</h1>
            <p className="text-gray-500 mt-1">{email}</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Link href={`/${locale}/dashboard/profile`} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
              <User className="w-4 h-4" /> {t('profile')}
            </Link>
            <Link href={`/${locale}/projects`} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
              <Heart className="w-4 h-4" /> {t('donateBtn')}
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statsCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card p-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-extrabold text-gray-900">{value}</p>
              <p className="text-gray-500 text-sm mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 flex gap-1 mb-6">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
                tab === id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800',
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── My Donations Tab ── */}
        {tab === 'donations' && (
          <div className="card">
            {donationsLoading ? (
              <div className="p-12 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full mx-auto" />
              </div>
            ) : donations.length === 0 ? (
              <div className="p-12 text-center">
                <Heart className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">{t('noDonations')}</p>
                <Link href={`/${locale}/projects`} className="btn-primary text-sm py-2 px-5">
                  {t('explorProjects')}
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {donations.map((donation: any) => {
                  const translation = getTranslation(donation.project?.block?.translations || [], locale);
                  return (
                    <div key={donation.id} className="p-5 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{translation?.name || t('projectFallback')}</p>
                        <p className="text-sm text-gray-400 mt-0.5">{formatDate(donation.createdAt, locale)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">{formatCurrency(Number(donation.amount))}</p>
                        <span className={`badge mt-1 ${getStatusColor(donation.status)}`}>
                          {donation.status}
                        </span>
                      </div>
                      {donation.status === 'pending' && donation.qrToken && (
                        <Link
                          href={`/${locale}/donations/${donation.qrToken}`}
                          className="flex-shrink-0 p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title={t('viewQrCode')}
                        >
                          <QrCode className="w-5 h-5" />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── My Votes Tab ── */}
        {tab === 'votes' && (
          <MyVotesTab locale={locale} />
        )}

        {/* ── Online Donations Tab ── */}
        {tab === 'online' && (
          <div className="card">
            {onlineLoading ? (
              <div className="p-12 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full mx-auto" />
              </div>
            ) : onlineDonations.length === 0 ? (
              <div className="p-12 text-center">
                <CreditCard className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">{t('noOnlineDonations')}</p>
                <Link href={`/${locale}/projects`} className="btn-primary text-sm py-2 px-5">
                  {t('explorProjects')}
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {onlineDonations.map((d: any) => {
                  const translation = getTranslation(d.project?.block?.translations || [], locale);
                  return (
                    <div key={d.id} className="p-5 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{translation?.name || t('projectFallback')}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <ProviderBadge provider={d.provider} />
                          <span className="text-xs text-gray-400">{formatDate(d.createdAt, locale)}</span>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="font-bold text-gray-900">{formatCurrency(Number(d.amount), d.currency)}</p>
                        <span className={`badge text-xs ${getStatusColor(d.status)}`}>{d.status}</span>
                      </div>
                      {d.status === 'completed' && (
                        <a
                          href={`/api/receipt/${d.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            window.print();
                          }}
                          className="flex-shrink-0 p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                          title={t('printReceipt')}
                        >
                          <Printer className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── My Votes sub-component ────────────────────────────────────────────────────
function MyVotesTab({ locale }: { locale: string }) {
  const t = useTranslations('dashboard');
  const { data, isLoading } = useQuery({
    queryKey: ['my-votes'],
    queryFn: () => votingApi.getMyVotes(),
  });

  const votes: any[] = data ?? [];

  if (isLoading) {
    return (
      <div className="card p-12 text-center">
        <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (votes.length === 0) {
    return (
      <div className="card p-8 text-center space-y-4">
        <Vote className="w-12 h-12 text-gray-200 mx-auto" />
        <p className="text-gray-400">{t('noVotes')}</p>
        <Link href={`/${locale}/projects`} className="btn-primary text-sm py-2 px-5 inline-flex items-center gap-2">
          <ExternalLink className="w-4 h-4" />
          {t('browseProjects')}
        </Link>
      </div>
    );
  }

  return (
    <div className="card divide-y divide-gray-100">
      {votes.map((v: any) => {
        const translation = getTranslation(v.study?.project?.block?.translations || [], locale);
        const projectId = v.study?.project?.id;
        return (
          <div key={v.id} className="p-5 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{translation?.name || `Study #${v.studyId}`}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="badge bg-gray-100 text-gray-600 text-xs capitalize">{v.study?.status?.replace(/_/g, ' ')}</span>
                <span className="text-xs text-gray-400">{formatDate(v.createdAt, locale)}</span>
              </div>
            </div>
            <VoteBadge choice={v.choice} />
            {projectId && (
              <Link
                href={`/${locale}/projects/${projectId}/study`}
                className="flex-shrink-0 p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                title={t('viewStudy')}
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
