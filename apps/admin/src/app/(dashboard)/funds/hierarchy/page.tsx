'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Banknote, ChevronDown, ChevronRight, FolderTree } from 'lucide-react';
import { useState } from 'react';
import { fundsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

const TYPE_BADGE: Record<string, string> = {
  master: 'bg-purple-100 text-purple-700',
  organization: 'bg-slate-100 text-slate-700',
  council: 'bg-indigo-100 text-indigo-700',
  donor: 'bg-pink-100 text-pink-700',
};

interface FundNode {
  id: number;
  name: string;
  type: string;
  status: string;
  balance: number;
  children: FundNode[];
  projects: Array<{ id: number; name: string; value: number }>;
}

function FundNodeRow({ node, depth }: { node: FundNode; depth: number }) {
  const { t, locale } = useLanguage();
  const [open, setOpen] = useState(depth < 2);
  const hasContent = node.children.length > 0 || node.projects.length > 0;

  return (
    <div style={{ marginInlineStart: depth > 0 ? '1.5rem' : 0 }}>
      <div className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-800">
        {hasContent ? (
          <button onClick={() => setOpen(!open)} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0">
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-4.5 shrink-0" />
        )}
        <Banknote className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="font-medium text-sm">{node.name}</span>
        <span className={cn('badge', TYPE_BADGE[node.type])}>{t(`funds.types.${node.type}`) || node.type}</span>
        <span className="text-xs text-gray-400 ms-auto shrink-0">
          {t('funds.hierarchy.balance')}: {Number(node.balance).toLocaleString(locale)}
        </span>
      </div>

      {open && (
        <div>
          {node.children.map((child) => (
            <FundNodeRow key={child.id} node={child} depth={depth + 1} />
          ))}
          {node.projects.map((project) => (
            <div
              key={`project-${project.id}`}
              style={{ marginInlineStart: '1.5rem' }}
              className="flex items-center gap-2 py-1.5 text-sm text-gray-600 dark:text-gray-300 border-b border-gray-50 dark:border-gray-800"
            >
              <FolderTree className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              <span>{project.name}</span>
              <span className="text-xs text-gray-400 ms-auto shrink-0">{Number(project.value).toLocaleString(locale)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * W9 — visualizes the fund hierarchy: master funds (mirroring the project
 * category taxonomy, including nesting, e.g. Water under Infrastructure) →
 * organization funds → the projects each fund is the default fund for.
 * Pre-W9 flat funds are listed separately since they carry no category.
 */
export default function FundHierarchyPage() {
  const { t } = useLanguage();
  const { data } = useQuery({ queryKey: ['fund-hierarchy'], queryFn: () => fundsApi.hierarchy() });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/funds" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <FolderTree className="w-5 h-5 text-primary-600" />
        <h1 className="text-lg font-semibold">{t('funds.hierarchy.title')}</h1>
        <span className="text-sm text-gray-400">{t('funds.hierarchy.subtitle')}</span>
      </div>

      <div className="card p-5">
        {(data?.roots ?? []).map((node: FundNode) => (
          <FundNodeRow key={node.id} node={node} depth={0} />
        ))}
        {(data?.roots ?? []).length === 0 && <p className="text-gray-400 text-sm">{t('funds.hierarchy.empty')}</p>}
      </div>

      {(data?.unattached ?? []).length > 0 && (
        <div className="card p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('funds.hierarchy.unattachedHeading')}</div>
          <p className="text-xs text-gray-400 mb-3">{t('funds.hierarchy.unattachedNote')}</p>
          {data.unattached.map((node: FundNode) => (
            <FundNodeRow key={node.id} node={node} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
