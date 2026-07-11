import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Banknote, FolderTree } from 'lucide-react';
import { categoriesApi, transparencyApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { Metadata } from 'next';

interface Props { params: { locale: string; id: string } }

interface CategoryNode {
  id: number;
  key: string;
  name: string;
  nameAr?: string | null;
  nameFr?: string | null;
  description?: string | null;
  children: CategoryNode[];
}

function label(node: { name: string; nameAr?: string | null; nameFr?: string | null }, locale: string): string {
  if (locale === 'ar' && node.nameAr) return node.nameAr;
  if (locale === 'fr' && node.nameFr) return node.nameFr;
  return node.name;
}

/** Finds a node by id in the tree, tracking the breadcrumb path of ancestors on the way down. */
function findWithPath(nodes: CategoryNode[], id: number, path: CategoryNode[] = []): { node: CategoryNode; path: CategoryNode[] } | null {
  for (const node of nodes) {
    if (node.id === id) return { node, path };
    const found = findWithPath(node.children, id, [...path, node]);
    if (found) return found;
  }
  return null;
}

export async function generateMetadata({ params: { locale, id } }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'sectors' });
  try {
    const aggregate = await transparencyApi.sector(Number(id));
    return { title: `${aggregate.data.category.name} — ${t('title')}` };
  } catch {
    return { title: t('title') };
  }
}

export const revalidate = 30;

/** W9 — sector detail: totals rolled up over the sector and its descendants, its funds, and active projects. */
export default async function SectorDetailPage({ params: { locale, id } }: Props) {
  const t = await getTranslations({ locale, namespace: 'sectors' });

  let aggregate: any;
  let tree: CategoryNode[] = [];
  try {
    [aggregate, tree] = await Promise.all([
      transparencyApi.sector(Number(id)),
      categoriesApi.tree().catch(() => []),
    ]);
  } catch {
    notFound();
  }
  const report = aggregate.data;
  const located = findWithPath(tree, Number(id));

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container max-w-4xl space-y-6">
        <nav className="text-sm text-gray-500">
          <Link href={`/${locale}/sectors`} className="hover:text-primary-600">{t('title')}</Link>
          {(located?.path ?? []).map((ancestor) => (
            <span key={ancestor.id}>
              <span className="mx-2">/</span>
              <Link href={`/${locale}/sectors/${ancestor.id}`} className="hover:text-primary-600">{label(ancestor, locale)}</Link>
            </span>
          ))}
          <span className="mx-2">/</span>
          <span className="text-gray-900">{label(report.category, locale)}</span>
        </nav>

        <div className="card p-6">
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-primary-600" /> {label(report.category, locale)}
          </h1>
          {located?.node.description && <p className="text-gray-500 mt-1">{located.node.description}</p>}
          <p className="text-xs text-gray-400 mt-1">{t('asOf')} {new Date(aggregate.asOf).toLocaleString(locale)}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {[
              [t('totalDonations'), report.totalDonations],
              [t('totalAllocated'), report.totalAllocated],
              [t('totalSpent'), report.totalSpent],
              [t('remainingBalance'), report.remainingBalance],
            ].map(([label_, value]: any) => (
              <div key={label_} className="p-4 bg-gray-50 rounded-xl text-center">
                <p className="text-xl font-extrabold text-primary-600">{formatCurrency(value, undefined, locale)}</p>
                <p className="text-xs text-gray-500 mt-1">{label_}</p>
              </div>
            ))}
          </div>
        </div>

        {(located?.node.children.length ?? 0) > 0 && (
          <div className="card p-6">
            <h2 className="font-bold text-lg mb-4">{t('subsectors')}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {located!.node.children.map((child) => (
                <Link key={child.id} href={`/${locale}/sectors/${child.id}`} className="p-3 border border-gray-100 rounded-xl hover:border-primary-200 transition-all">
                  {label(child, locale)}
                </Link>
              ))}
            </div>
          </div>
        )}

        {report.funds.length > 0 && (
          <div className="card p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Banknote className="w-5 h-5 text-primary-600" /> {t('funds')}
            </h2>
            <div className="space-y-2">
              {report.funds.map((fund: any) => (
                <Link key={fund.id} href={`/${locale}/transparency/funds/${fund.id}`} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:border-primary-200 transition-all">
                  <span className="font-medium text-gray-900">{fund.name}</span>
                  <span className="text-sm text-gray-500">{formatCurrency(fund.balance, undefined, locale)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">{t('activeProjects')} ({report.totalProjects})</h2>
            <Link href={`/${locale}/projects?categoryKey=${report.category.key}`} className="text-sm text-primary-600 hover:underline">
              {t('browseProjects')}
            </Link>
          </div>
          <div className="space-y-2">
            {report.activeProjects.slice(0, 10).map((project: any) => (
              <Link key={project.id} href={`/${locale}/projects/${project.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 text-sm">
                <span>{project.name}</span>
                <span className="text-gray-400">{formatCurrency(project.value, undefined, locale)}</span>
              </Link>
            ))}
            {report.activeProjects.length === 0 && <p className="text-gray-400 text-sm">{t('noActiveProjects')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
