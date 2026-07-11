import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FolderTree } from 'lucide-react';
import { categoriesApi } from '@/lib/api';
import type { Metadata } from 'next';

interface Props { params: { locale: string } }

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'sectors' });
  return { title: t('title') };
}

export const revalidate = 60;

function sectorLabel(node: { name: string; nameAr?: string | null; nameFr?: string | null }, locale: string): string {
  if (locale === 'ar' && node.nameAr) return node.nameAr;
  if (locale === 'fr' && node.nameFr) return node.nameFr;
  return node.name;
}

/**
 * W9 — public sector browsing: the same civic taxonomy that drives the
 * fund hierarchy (one master fund per sector), presented for citizens to
 * explore before donating to a project or a sector's funds.
 */
export default async function SectorsPage({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'sectors' });

  let roots: any[] = [];
  try {
    roots = (await categoriesApi.tree()) ?? [];
  } catch {
    return (
      <div className="min-h-screen bg-gray-50 py-16 text-center text-gray-500">
        {t('title')} — {t('loadError')}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-2">
            <FolderTree className="w-7 h-7 text-primary-600" /> {t('title')}
          </h1>
          <p className="text-gray-500 mt-1">{t('subtitle')}</p>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {roots.map((sector: any) => (
            <Link
              key={sector.id}
              href={`/${locale}/sectors/${sector.id}`}
              className="card p-5 hover:shadow-md hover:border-primary-200 transition-all"
            >
              <p className="font-semibold text-gray-900">{sectorLabel(sector, locale)}</p>
              {sector.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{sector.description}</p>}
              {sector.children?.length > 0 && (
                <p className="text-xs text-gray-400 mt-3">
                  {t('subsectorsCount', { count: sector.children.length })}
                </p>
              )}
            </Link>
          ))}
          {roots.length === 0 && <p className="text-gray-400 text-sm">{t('empty')}</p>}
        </div>
      </div>
    </div>
  );
}
