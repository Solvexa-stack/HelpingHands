import { getTranslations } from 'next-intl/server';
import { ArrowDownRight, ArrowUpRight, Gavel, Route } from 'lucide-react';
import { transparencyApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const SOURCE_KEY: Record<string, string> = {
  qr_cash_donations: 'qrCash',
  online_donations: 'online',
  fund_allocations: 'fundAllocations',
};

/**
 * W7-E2-S2 — the public money trail on the project page: funding sources,
 * intake → account credit → spend category, Board decision history, with
 * "as of" freshness. Additive: renders nothing if the read layer is closed
 * by policy or unreachable.
 */
export async function ProjectTransparency({ projectId, locale }: { projectId: number; locale: string }) {
  const t = await getTranslations({ locale, namespace: 'transparency' });

  let aggregate: any;
  try {
    aggregate = await transparencyApi.project(projectId);
  } catch {
    return null; // policy-closed or unavailable — the page stays intact
  }
  const data = aggregate.data;
  const trail = data.moneyTrail;
  const label = (source: string) => (SOURCE_KEY[source] ? t(SOURCE_KEY[source] as never) : source.replace(/_/g, ' '));

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Route className="w-5 h-5 text-primary-600" /> {t('moneyTrail')}
        </h2>
        <span className="text-xs text-gray-400">
          {t('asOf')} {new Date(aggregate.asOf).toLocaleString(locale)}
        </span>
      </div>

      {/* Funding sources */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 mb-2">{t('fundingSources')}</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="p-3 bg-gray-50 rounded-xl text-center">
            <p className="font-bold text-primary-600">{formatCurrency(data.funding.byChannel.qr_cash_donations.amount)}</p>
            <p className="text-xs text-gray-500">{t('qrCash')}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl text-center">
            <p className="font-bold text-primary-600">{formatCurrency(data.funding.byChannel.online_donations.amount)}</p>
            <p className="text-xs text-gray-500">{t('online')}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl text-center">
            <p className="font-bold text-primary-600">
              {formatCurrency(data.funding.allocations.reduce((s: number, a: any) => s + a.disbursed, 0))}
            </p>
            <p className="text-xs text-gray-500">
              {t('fundAllocations')}
              {data.funding.allocations.length > 0 && (
                <span className="block text-[10px] text-gray-400">
                  {data.funding.allocations.map((a: any) => a.fund.name).join(' · ')}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Intake → spend chain */}
      {trail && (trail.intake.length > 0 || trail.spend.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1">
              <ArrowDownRight className="w-4 h-4 text-emerald-500" /> {t('intake')}
            </h3>
            {trail.intake.map((row: any) => (
              <div key={row.source} className="flex justify-between text-sm py-0.5">
                <span className="text-gray-600">{label(row.source)}</span>
                <span className="font-medium text-emerald-600">+{formatCurrency(row.amount)}</span>
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1">
              <ArrowUpRight className="w-4 h-4 text-amber-500" /> {t('spend')}
            </h3>
            {trail.spend.length === 0 && <p className="text-sm text-gray-400">—</p>}
            {trail.spend.map((row: any) => (
              <div key={row.category} className="flex justify-between text-sm py-0.5">
                <span className="text-gray-600">{label(row.category)}</span>
                <span className="font-medium text-amber-600">−{formatCurrency(row.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-2 mt-2 border-t border-gray-100 font-semibold">
              <span>{t('remaining')}</span>
              <span>{formatCurrency(trail.balance)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Board decisions */}
      {data.decisions && data.decisions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1">
            <Gavel className="w-4 h-4" /> {t('decisions')}
          </h3>
          <div className="space-y-2">
            {data.decisions.map((d: any, i: number) => (
              <div key={i} className="text-sm p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between">
                  <span
                    className={`font-semibold ${
                      d.decision === 'approved' ? 'text-emerald-600' : d.decision === 'rejected' ? 'text-red-600' : 'text-amber-600'
                    }`}
                  >
                    {String(d.decision).replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(d.decidedAt).toLocaleDateString(locale)}</span>
                </div>
                <p className="text-gray-600 mt-1">{d.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
