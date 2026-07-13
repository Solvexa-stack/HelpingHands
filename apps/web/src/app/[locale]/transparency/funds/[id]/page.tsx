import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Banknote, Download, Heart } from 'lucide-react';
import { transparencyApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { OnlineDonateButton } from '@/components/donations/online-donate-button';
import type { Metadata } from 'next';

interface Props { params: { locale: string; id: string } }

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'transparency' });
  return { title: t('funds') };
}

export const revalidate = 30;

function categoryLabel(category: any, locale: string): string {
  if (!category) return '—';
  if (locale === 'ar' && category.nameAr) return category.nameAr;
  if (locale === 'fr' && category.nameFr) return category.nameFr;
  return category.name;
}

function projectName(names: Array<{ languageCode: string; name: string }>, locale: string): string {
  return names.find((n) => n.languageCode === locale)?.name ?? names[0]?.name ?? '';
}

/** W7-E2-S1 — public fund page: intake, allocations, spend by category. */
export default async function FundTransparencyPage({ params: { locale, id } }: Props) {
  const t = await getTranslations({ locale, namespace: 'transparency' });

  let aggregate: any;
  try {
    aggregate = await transparencyApi.fund(Number(id));
  } catch {
    notFound();
  }
  const fund = aggregate.data;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container max-w-4xl space-y-6">
        <nav className="text-sm text-gray-500">
          <Link href={`/${locale}/transparency`} className="hover:text-primary-600">{t('title')}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{fund.name}</span>
        </nav>

        <div className="card p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
                <Banknote className="w-6 h-6 text-primary-600 flex-shrink-0" /> {fund.name}
              </h1>
              {fund.purpose && <p className="text-gray-500 mt-1">{fund.purpose}</p>}
              <p className="text-xs text-gray-400 mt-1">
                {t('asOf')} {new Date(aggregate.asOf).toLocaleString(locale)}
              </p>
            </div>
            <a
              href={`${apiBase}/v1/transparency/exports/funds/${fund.id}/statement.csv`}
              className="btn-primary text-sm py-2 px-3 inline-flex items-center gap-1.5 whitespace-nowrap self-start"
            >
              <Download className="w-4 h-4" /> {t('downloadStatement')}
            </a>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {[
              [t('balance'), fund.balance],
              [t('intake'), fund.intake],
              [t('allocated'), fund.allocated],
              [t('disbursed'), fund.disbursed],
            ].map(([label, value]: any) => (
              <div key={label} className="p-4 bg-gray-50 rounded-xl text-center">
                <p className="text-xl font-extrabold text-primary-600">{formatCurrency(value, undefined, locale)}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {fund.status === 'active' && (
          <div className="card p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Heart className="w-5 h-5 text-primary-600" /> {t('donateToFund')}
            </h2>
            <OnlineDonateButton target={{ fundId: fund.id }} redirectPath={`/transparency/funds/${fund.id}`} />
          </div>
        )}

        {fund.spendByCategory && (
          <div className="card p-6">
            <h2 className="font-bold text-lg mb-4">{t('spendByCategory')}</h2>
            <div className="space-y-2">
              {fund.spendByCategory.map((row: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600">{categoryLabel(row.category, locale)}</span>
                  <span className="font-medium">
                    {formatCurrency(row.disbursed, undefined, locale)} / {formatCurrency(row.allocated, undefined, locale)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {fund.allocations && (
          <div className="card p-6">
            <h2 className="font-bold text-lg mb-4">{t('allocations')}</h2>
            <div className="space-y-3">
              {fund.allocations.map((a: any) => (
                <Link
                  key={a.id}
                  href={`/${locale}/projects/${a.project.id}`}
                  className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:border-primary-200 transition-all"
                >
                  <div>
                    <p className="font-medium text-gray-900">{projectName(a.project.names, locale)}</p>
                    <p className="text-xs text-gray-400">
                      {categoryLabel(a.project.category, locale)} · {a.status}
                    </p>
                  </div>
                  <div className="text-end text-sm">
                    <p className="font-semibold">{formatCurrency(a.disbursed, undefined, locale)}</p>
                    <p className="text-xs text-gray-400">/ {formatCurrency(a.amount, undefined, locale)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
