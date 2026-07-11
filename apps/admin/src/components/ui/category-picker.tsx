'use client';

import { useQuery } from '@tanstack/react-query';
import { categoriesApi } from '@/lib/api';
import { useLanguage } from '@/contexts/language-context';

interface CategoryNode {
  id: number;
  key: string;
  name: string;
  nameAr?: string | null;
  nameFr?: string | null;
  children: CategoryNode[];
}

export function categoryLabel(node: { name: string; nameAr?: string | null; nameFr?: string | null }, locale = 'en') {
  if (locale === 'ar') return node.nameAr || node.name;
  if (locale === 'fr') return node.nameFr || node.name;
  return node.name;
}

/**
 * W6-E2-S3 — hierarchical civic category picker. Parents with children render
 * as optgroups (selectable via their own entry); leaf nodes select directly.
 * Value is the category node id.
 */
export function CategoryPicker({
  value,
  onChange,
  locale,
  className = 'input',
}: {
  value: number | '';
  onChange: (categoryId: number) => void;
  locale?: string;
  className?: string;
}) {
  const { t, locale: activeLocale } = useLanguage();
  const resolvedLocale = locale ?? activeLocale;
  const { data: tree } = useQuery({ queryKey: ['category-tree'], queryFn: () => categoriesApi.tree() });
  const roots: CategoryNode[] = tree ?? [];

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      <option value="" disabled>
        {t('categoryPicker.selectPlaceholder')}
      </option>
      {roots.map((root) =>
        root.children.length > 0 ? (
          <optgroup key={root.key} label={categoryLabel(root, resolvedLocale)}>
            <option value={root.id}>{categoryLabel(root, resolvedLocale)} {t('categoryPicker.generalSuffix')}</option>
            {root.children.map((child) => (
              <option key={child.key} value={child.id}>
                {categoryLabel(child, resolvedLocale)}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={root.key} value={root.id}>
            {categoryLabel(root, resolvedLocale)}
          </option>
        ),
      )}
    </select>
  );
}
