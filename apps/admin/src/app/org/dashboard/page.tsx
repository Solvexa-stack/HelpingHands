'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, FolderKanban, Heart, Landmark, TrendingUp, Vote, ArrowRight, Plus, UserPlus } from 'lucide-react';
import { dashboardApi, transparencyApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { cn, formatDatetime } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

/**
 * W3 UI isolation — the Organization Workspace home. Every number on this
 * page is tenant-scoped by the backend (W2): the org's own projects,
 * donations and studies. No platform-wide statistics exist here.
 */
export default function OrgDashboardPage() {
  const { t, locale } = useLanguage();
  const { activeOrg, user } = useAuth();

  const { data: stats } = useQuery({ queryKey: ['org-stats'], queryFn: () => dashboardApi.stats() });
  const { data: recentDonations } = useQuery({
    queryKey: ['org-recent-donations'],
    queryFn: () => dashboardApi.recentDonations(),
  });
  const { data: recentProjects } = useQuery({
    queryKey: ['org-recent-projects'],
    queryFn: () => dashboardApi.recentProjects(),
  });
  // W7-E3-S2: read-layer portfolio + funding received + report calendar
  const { data: orgDash } = useQuery({
    queryKey: ['org-dashboard-w7'],
    queryFn: () => transparencyApi.orgDashboard(),
  });

  const tiles = [
    { label: t('orgDashboard.tiles.projects'), value: stats?.totalProjects ?? '—', sub: t('orgDashboard.tiles.projectsSub', { count: stats?.completedProjects ?? 0 }), icon: FolderKanban, href: '/org/projects' },
    { label: t('orgDashboard.tiles.donations'), value: stats?.totalDonations ?? '—', sub: t('orgDashboard.tiles.donationsSub', { count: stats?.pendingDonations ?? 0 }), icon: Heart, href: '/org/donations' },
    { label: t('orgDashboard.tiles.collected'), value: stats ? Number(stats.totalCollected).toLocaleString() : '—', sub: t('orgDashboard.tiles.collectedSub', { rate: stats?.projectCompletionRate ?? 0 }), icon: TrendingUp, href: '/org/projects' },
    { label: t('orgDashboard.tiles.openVotings'), value: stats?.pendingVotes ?? '—', sub: t('orgDashboard.tiles.openVotingsSub'), icon: Vote, href: '/org/studies' },
  ];

  return (
    <div className="space-y-6">
      {/* Workspace hero */}
      <div className="card p-6 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white">
        <p className="text-emerald-100 text-sm">{t('orgDashboard.hero.eyebrow')}</p>
        <h1 className="text-2xl font-bold mt-1">{activeOrg?.name}</h1>
        <p className="text-emerald-100 text-sm mt-2">
          {t('orgDashboard.hero.welcome', { name: user?.admin?.firstName ? `, ${user.admin.firstName}` : '' })}
        </p>
        {/* Quick actions: the two things a fresh workspace needs first */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Link href="/org/projects/new" className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors rounded-lg px-3 py-1.5 text-sm font-medium">
            <Plus className="w-4 h-4" /> {t('orgDashboard.hero.newProject')}
          </Link>
          <Link href="/org/team" className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors rounded-lg px-3 py-1.5 text-sm font-medium">
            <UserPlus className="w-4 h-4" /> {t('orgDashboard.hero.inviteTeamMember')}
          </Link>
        </div>
      </div>

      {/* Org stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map(({ label, value, sub, icon: Icon, href }) => (
          <Link key={label} href={href} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{label}</p>
              <Icon className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold mt-2">{value}</p>
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
          </Link>
        ))}
      </div>

      {/* W7: funding received + report calendar (read layer) */}
      {orgDash && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="card p-5 space-y-2">
            <div className="font-semibold flex items-center gap-2">
              <Landmark className="w-4 h-4 text-emerald-600" /> {t('orgDashboard.fundingReceived.heading')}
            </div>
            {orgDash.fundingReceived.allocations.length === 0 && (
              <p className="text-sm text-gray-400">{t('orgDashboard.fundingReceived.empty')}</p>
            )}
            {orgDash.fundingReceived.allocations.map((a: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-600">{a.fund?.name}</span>
                <span className="font-medium">{Number(a.amount).toLocaleString()}</span>
              </div>
            ))}
            {orgDash.fundingReceived.allocations.length > 0 && (
              <div className="flex justify-between text-sm pt-2 border-t border-gray-100 font-semibold">
                <span>{t('orgDashboard.fundingReceived.totalAllocated')}</span>
                <span>{Number(orgDash.fundingReceived.totalAllocated).toLocaleString()}</span>
              </div>
            )}
          </div>
          <div className="card p-5 space-y-2">
            <div className="font-semibold flex items-center gap-2">
              <AlarmClock className="w-4 h-4 text-emerald-600" /> {t('orgDashboard.reportCalendar.heading')}
            </div>
            {orgDash.reportCalendar.length === 0 && (
              <p className="text-sm text-gray-400">{t('orgDashboard.reportCalendar.empty')}</p>
            )}
            {orgDash.reportCalendar.map((o: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm gap-2">
                <span className="text-gray-600 truncate">
                  {t('orgDashboard.reportCalendar.line', { type: o.type, agreementTitle: o.agreementTitle })}
                </span>
                <span className={cn('badge text-xs whitespace-nowrap', o.overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800')}>
                  {o.overdue ? t('orgDashboard.reportCalendar.overdue') : t('orgDashboard.reportCalendar.dueDate', { date: formatDatetime(o.dueAt, locale) })}
                </span>
              </div>
            ))}
            <Link href="/org/reports" className="text-sm text-emerald-700 hover:underline inline-flex items-center gap-1">
              {t('orgDashboard.reportCalendar.goToReports')} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Recent donations */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-sm">{t('orgDashboard.recentDonations.heading')}</h2>
            <Link href="/org/donations" className="text-xs text-emerald-600 flex items-center gap-1">
              {t('orgDashboard.recentDonations.viewAll')} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {(recentDonations ?? []).slice(0, 6).map((d: any) => (
              <div key={d.id} className="px-5 py-3 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {d.participant?.firstName} {d.participant?.lastName}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {d.project?.block?.translations?.[0]?.name ?? `Project #${d.projectId}`}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="font-semibold">{Number(d.amount).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{formatDatetime(d.createdAt, locale)}</p>
                </div>
              </div>
            ))}
            {(recentDonations ?? []).length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-gray-400">{t('orgDashboard.recentDonations.empty')}</p>
            )}
          </div>
        </div>

        {/* Recent projects */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-sm">{t('orgDashboard.recentProjects.heading')}</h2>
            <Link href="/org/projects" className="text-xs text-emerald-600 flex items-center gap-1">
              {t('orgDashboard.recentProjects.viewAll')} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {(recentProjects ?? []).slice(0, 6).map((p: any) => (
              <Link key={p.id} href={`/org/projects/${p.id}`} className="px-5 py-3 flex items-center justify-between text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.block?.translations?.[0]?.name ?? `Project #${p.id}`}</p>
                  <p className="text-xs text-gray-400">{p._count?.donations ?? 0} donations</p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="font-semibold">{Number(p.progression)}%</p>
                  <p className="text-xs text-gray-400">of {Number(p.value).toLocaleString()}</p>
                </div>
              </Link>
            ))}
            {(recentProjects ?? []).length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-gray-400">{t('orgDashboard.recentProjects.empty')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
