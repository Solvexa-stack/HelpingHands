import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BadgeCheck, Building2 } from 'lucide-react';
import { transparencyApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { Metadata } from 'next';

interface Props { params: { locale: string; id: string } }

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'transparency' });
  return { title: t('organizations') };
}

export const revalidate = 30;

function categoryLabel(category: any, locale: string): string {
  if (!category) return '—';
  if (locale === 'ar' && category.nameAr) return category.nameAr;
  if (locale === 'fr' && category.nameFr) return category.nameFr;
  return category.name;
}

/** W7-E2-S1 — organization public page: profile, verified badge, portfolio. */
export default async function OrgTransparencyPage({ params: { locale, id } }: Props) {
  const t = await getTranslations({ locale, namespace: 'transparency' });

  let aggregate: any;
  try {
    aggregate = await transparencyApi.organization(Number(id));
  } catch {
    notFound();
  }
  const org = aggregate.data;
  const profile =
    org.profile.find((p: any) => p.languageCode === locale) ?? org.profile[0] ?? null;

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container max-w-4xl space-y-6">
        <nav className="text-sm text-gray-500">
          <Link href={`/${locale}/transparency`} className="hover:text-primary-600">{t('title')}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{org.name}</span>
        </nav>

        <div className="card p-6">
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary-600" /> {org.name}
            {org.verified && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2.5 py-0.5">
                <BadgeCheck className="w-4 h-4" /> {t('verified')}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-400 mt-1 capitalize">
            {String(org.type).replace(/_/g, ' ')} · {t('asOf')} {new Date(aggregate.asOf).toLocaleString(locale)}
          </p>
          {profile?.description && (
            <p className="text-gray-600 mt-3 leading-relaxed">{profile.description}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {[
              [t('portfolio'), org.totals.projects],
              ['✓', org.totals.completed],
              ['Σ', formatCurrency(org.totals.targetValue)],
              [t('intake'), formatCurrency(org.totals.collected)],
            ].map(([label, value]: any, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-xl text-center">
                <p className="text-xl font-extrabold text-primary-600">{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-bold text-lg mb-4">{t('portfolio')}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {org.portfolio.map((p: any) => {
              const name = p.names.find((n: any) => n.languageCode === locale)?.name ?? p.names[0]?.name ?? `#${p.id}`;
              return (
                <Link
                  key={p.id}
                  href={`/${locale}/projects/${p.id}`}
                  className="p-4 border border-gray-100 rounded-xl hover:border-primary-200 hover:shadow-sm transition-all"
                >
                  <p className="font-medium text-gray-900">{name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{categoryLabel(p.category, locale)}</p>
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.min(p.progression, 100)}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatCurrency(p.collected)} / {formatCurrency(p.target)}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
