'use client';

import { useQuery } from '@tanstack/react-query';
import {
  FolderKanban, Heart, Clock, CheckCircle, Users,
  UserCheck, DollarSign, TrendingUp, ArrowUpRight
} from 'lucide-react';
import { dashboardApi } from '@/lib/api';
import { formatCurrency, formatDate, getTranslation, STATUS_COLORS } from '@/lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

function getMonthLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short' });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2000, i, 1)));
}

export default function DashboardPage() {
  const { t, locale } = useLanguage();
  const MONTHS = getMonthLabels(locale);
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.stats,
  });

  const { data: recentDonations } = useQuery({
    queryKey: ['recent-donations'],
    queryFn: dashboardApi.recentDonations,
  });

  const { data: recentProjects } = useQuery({
    queryKey: ['recent-projects'],
    queryFn: dashboardApi.recentProjects,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ['donations-chart'],
    queryFn: () => dashboardApi.donationsByMonth(),
  });

  const chartFormatted = (chartData ?? []).map((d: any) => ({
    month: MONTHS[d.month - 1],
    amount: Number(d.amount),
    count: d.count,
  }));

  const hasChartData = chartFormatted.some((d: any) => d.amount > 0 || d.count > 0);

  const statCards = [
    { icon: FolderKanban, label: t('dashboard.totalProjects'), value: stats?.totalProjects ?? '—', color: 'text-blue-600 bg-blue-50', href: '/projects' },
    { icon: Heart, label: t('dashboard.totalDonations'), value: stats?.totalDonations ?? '—', color: 'text-rose-600 bg-rose-50', href: '/donations' },
    { icon: Clock, label: t('dashboard.pending'), value: stats?.pendingDonations ?? '—', color: 'text-yellow-600 bg-yellow-50', href: '/donations?status=pending' },
    { icon: CheckCircle, label: t('dashboard.approved'), value: stats?.approvedDonations ?? '—', color: 'text-green-600 bg-green-50', href: '/donations?status=approved' },
    { icon: DollarSign, label: t('dashboard.totalCollected'), value: stats ? formatCurrency(stats.totalCollected, undefined, locale) : '—', color: 'text-emerald-600 bg-emerald-50', href: '/donations' },
    { icon: TrendingUp, label: t('dashboard.completion'), value: stats ? `${stats.projectCompletionRate}%` : '—', color: 'text-purple-600 bg-purple-50', href: '/projects' },
    { icon: Users, label: t('dashboard.participants'), value: stats?.totalParticipants ?? '—', color: 'text-indigo-600 bg-indigo-50', href: '/participants' },
    { icon: UserCheck, label: t('dashboard.employees'), value: stats?.totalEmployees ?? '—', color: 'text-orange-600 bg-orange-50', href: '/employees' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ icon: Icon, label, value, color, href }) => (
          <Link key={label} href={href} className="stat-card hover:shadow-md transition-shadow group">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', color)}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{statsLoading ? '…' : value}</p>
            <div className="flex items-center justify-between">
              <p className="text-gray-500 text-sm">{label}</p>
              <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-primary-500 transition-colors" />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">{t('dashboard.monthlyChart')}</h2>
          {chartLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-300">{t('common.loading')}</div>
          ) : (
            <div className="relative">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartFormatted}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v, undefined, locale), 'Amount']} />
                  <Area type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} fill="url(#colorAmount)" />
                </AreaChart>
              </ResponsiveContainer>
              {!hasChartData && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-sm text-gray-400 bg-white/80 px-3 py-1.5 rounded-lg">{t('dashboard.noApproved')}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent donations */}
        <div className="card">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{t('dashboard.recentDonations')}</h2>
            <Link href="/donations" className="text-xs text-primary-600 font-medium">{t('dashboard.viewAll')}</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentDonations?.slice(0, 6).map((d: any) => (
              <div key={d.id} className="p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {d.participant?.firstName} {d.participant?.lastName}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {getTranslation(d.project?.block?.translations || [])?.name}
                  </p>
                </div>
                <div className="text-end flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(Number(d.amount), undefined, locale)}</p>
                  <span className={cn('badge text-xs', STATUS_COLORS[d.status])}>{d.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
