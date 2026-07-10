'use client';

import { useQuery } from '@tanstack/react-query';
import { AlarmClock, BarChart3, Gavel, Landmark, ShieldCheck } from 'lucide-react';
import { transparencyApi } from '@/lib/api';
import { cn, formatDatetime } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

const fmt = (n: number, locale: string) => Number(n ?? 0).toLocaleString(locale);

/**
 * W7-E3-S1 — Board dashboard on the transparency read layer: cross-entity
 * KPIs, funds comparison, decision throughput, overdue reports. The same
 * aggregates the public portal serves — parity by construction.
 */
export function BoardDashboardTab() {
  const { t, locale } = useLanguage();
  const { data, isLoading } = useQuery({
    queryKey: ['board-dashboard'],
    queryFn: () => transparencyApi.boardDashboard(),
    refetchInterval: 60_000,
  });
  const { data: policy } = useQuery({ queryKey: ['publication-policy'], queryFn: () => transparencyApi.policy() });

  if (isLoading || !data) return <div className="card p-8 text-center text-gray-400">{t('board.dashboard.loading')}</div>;

  const platform = data.platform;
  const throughput = data.decisionThroughput;

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-400">
        {t('board.dashboard.asOfNote', { date: formatDatetime(data.asOf, locale) })}
      </p>

      {/* KPI row */}
      <div className="grid md:grid-cols-4 gap-4">
        {[
          {
            icon: Gavel,
            label: t('board.dashboard.kpi.decisions30d'),
            value: fmt(throughput.last30Days, locale),
            sub: t('board.dashboard.kpi.decisionsSub', { queue: throughput.openQueueSize, days: throughput.medianQueueAgeDays }),
          },
          {
            icon: AlarmClock,
            label: t('board.dashboard.kpi.reportsAwaiting'),
            value: fmt(data.reports.awaitingReview, locale),
            sub: t('board.dashboard.kpi.reportsOverdueSub', { count: data.reports.overdueAgreements }),
          },
          {
            icon: Landmark,
            label: t('board.dashboard.kpi.funds'),
            value: fmt(platform.funds.length, locale),
            sub: t('board.dashboard.kpi.fundsBalanceSub', { amount: fmt(platform.funds.reduce((s: number, f: any) => s + f.balance, 0), locale) }),
          },
          {
            icon: BarChart3,
            label: t('board.dashboard.kpi.qrIntake'),
            value: fmt(platform.intakeByChannel.qr_cash_donations.amount, locale),
            sub: t('board.dashboard.kpi.qrOnlineSub', {
              amount: fmt(platform.intakeByChannel.online_project_donations.amount + platform.intakeByChannel.online_fund_donations.amount, locale),
            }),
          },
        ].map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm"><Icon className="w-4 h-4" /> {label}</div>
            <p className="text-2xl font-bold mt-1">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Funds comparison */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold flex items-center gap-2">
          <Landmark className="w-4 h-4" /> {t('board.dashboard.fundsComparison')}
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">{t('board.dashboard.colFund')}</th>
              <th className="table-header">{t('common.status')}</th>
              <th className="table-header">{t('board.dashboard.colIntake')}</th>
              <th className="table-header">{t('board.dashboard.colAllocated')}</th>
              <th className="table-header">{t('board.dashboard.colDisbursed')}</th>
              <th className="table-header">{t('board.dashboard.colBalance')}</th>
              <th className="table-header">{t('board.dashboard.colStatement')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {platform.funds.map((f: any) => (
              <tr key={f.id}>
                <td className="table-cell font-medium">{f.name}</td>
                <td className="table-cell">
                  <span className={cn('badge', f.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500')}>{f.status}</span>
                </td>
                <td className="table-cell">{fmt(f.intake, locale)}</td>
                <td className="table-cell">{fmt(f.allocated, locale)}</td>
                <td className="table-cell">{fmt(f.disbursed, locale)}</td>
                <td className="table-cell font-semibold">{fmt(f.balance, locale)}</td>
                <td className="table-cell">
                  <a className="text-primary-600 text-sm hover:underline" href={transparencyApi.fundStatementUrl(f.id)} target="_blank" rel="noreferrer">
                    {t('board.dashboard.csvLink')}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Decision throughput */}
        <div className="card p-5 space-y-2">
          <div className="font-semibold flex items-center gap-2"><Gavel className="w-4 h-4" /> {t('board.dashboard.decisionThroughput')}</div>
          {Object.entries(throughput.byType).map(([type, count]) => (
            <div key={type} className="flex justify-between text-sm">
              <span className="capitalize text-gray-600">{type.replace(/_/g, ' ')}</span>
              <span className="font-medium">{count as number}</span>
            </div>
          ))}
        </div>

        {/* Publication policy snapshot (W7-E1-S2) */}
        <div className="card p-5 space-y-2">
          <div className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> {t('board.dashboard.publicationPolicy')}</div>
          {(policy ?? []).map((p: any) => (
            <div key={p.fieldClass} className="flex justify-between items-center text-sm gap-2">
              <span className="text-gray-600 font-mono text-xs">{p.fieldClass}</span>
              {p.visibility === 'never_public' ? (
                <span className="badge bg-red-100 text-red-700">{t('board.dashboard.neverPublic')}</span>
              ) : (
                <select
                  className="input py-0.5 px-2 text-xs w-auto"
                  value={p.visibility}
                  onChange={(e) =>
                    transparencyApi.setPolicy(p.fieldClass, e.target.value).then(() => window.location.reload())
                  }
                >
                  <option value="public">{t('board.dashboard.visibilityPublic')}</option>
                  <option value="workspace_only">{t('board.dashboard.visibilityWorkspaceOnly')}</option>
                </select>
              )}
            </div>
          ))}
          <p className="text-xs text-gray-400 pt-1">{t('board.dashboard.policyNote')}</p>
        </div>
      </div>
    </div>
  );
}
