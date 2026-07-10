import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BadgeCheck, Banknote, Building2, PieChart } from 'lucide-react';
import { transparencyApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { Metadata } from 'next';

interface Props { params: { locale: string } }

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'transparency' });
  return { title: t('title') };
}

export const revalidate = 30;

function categoryLabel(category: any, locale: string): string {
  if (!category) return '—';
  if (locale === 'ar' && category.nameAr) return category.nameAr;
  if (locale === 'fr' && category.nameFr) return category.nameFr;
  return category.name;
}

/**
 * W7-E2-S3 — the public transparency hub: platform statistics, funds
 * overview, and the organization directory, all from the read layer with
 * visible freshness.
 */
export default async function TransparencyPage({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'transparency' });

  let stats: any = null;
  let orgs: any[] = [];
  try {
    const [statsAgg, orgsAgg] = await Promise.all([
      transparencyApi.stats(),
      transparencyApi.organizations(),
    ]);
    stats = statsAgg;
    orgs = orgsAgg.data ?? [];
  } catch {
    return (
      <div className="min-h-screen bg-gray-50 py-16 text-center text-gray-500">
        {t('title')} — currently unavailable.
      </div>
    );
  }

  const data = stats.data;
  const intake = data.intakeByChannel;

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container max-w-6xl space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-2">
            <PieChart className="w-7 h-7 text-primary-600" /> {t('title')}
          </h1>
          <p className="text-gray-500 mt-1">{t('subtitle')}</p>
          <p className="text-xs text-gray-400 mt-1">
            {t('asOf')} {new Date(stats.asOf).toLocaleString(locale)}
          </p>
        </div>

        {/* Intake by channel */}
        <section className="card p-6">
          <h2 className="font-bold text-lg mb-4">{t('intakeByChannel')}</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              [t('qrCash'), intake.qr_cash_donations],
              [t('online'), intake.online_project_donations],
              [`${t('online')} → ${t('funds')}`, intake.online_fund_donations],
            ].map(([label, channel]: any) => (
              <div key={label} className="p-4 bg-gray-50 rounded-xl text-center">
                <p className="text-2xl font-extrabold text-primary-600">{formatCurrency(channel.amount, undefined, locale)}</p>
                <p className="text-sm text-gray-500 mt-1">{label}</p>
                <p className="text-xs text-gray-400">{channel.count}×</p>
              </div>
            ))}
          </div>
        </section>

        {/* Funds overview */}
        <section className="card p-6">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Banknote className="w-5 h-5 text-primary-600" /> {t('funds')}
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {data.funds.map((fund: any) => (
              <Link
                key={fund.id}
                href={`/${locale}/transparency/funds/${fund.id}`}
                className="p-4 border border-gray-100 rounded-xl hover:border-primary-200 hover:shadow-sm transition-all"
              >
                <p className="font-semibold text-gray-900">{fund.name}</p>
                <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
                  <span className="text-gray-400">{t('balance')}</span>
                  <span className="text-end font-medium">{formatCurrency(fund.balance, undefined, locale)}</span>
                  <span className="text-gray-400">{t('disbursed')}</span>
                  <span className="text-end font-medium">{formatCurrency(fund.disbursed, undefined, locale)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Projects by category */}
          <section className="card p-6">
            <h2 className="font-bold text-lg mb-4">{t('projectsByCategory')}</h2>
            <div className="space-y-2">
              {data.projectsByCategory.map((row: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600">{categoryLabel(row.category, locale)}</span>
                  <span className="font-medium">{row.projects}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Organizations directory */}
          <section className="card p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary-600" /> {t('organizations')}
            </h2>
            <div className="space-y-2">
              {orgs.map((org: any) => (
                <Link
                  key={org.id}
                  href={`/${locale}/transparency/organizations/${org.id}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 text-sm"
                >
                  <span className="flex items-center gap-1.5">
                    {org.name}
                    {org.verified && <BadgeCheck className="w-4 h-4 text-emerald-500" />}
                  </span>
                  <span className="text-gray-400 capitalize">
                    {String(org.type).replace(/_/g, ' ')} · {org.projects}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
