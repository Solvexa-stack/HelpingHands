'use client';

import { useQuery } from '@tanstack/react-query';
import { categoriesApi } from '@/lib/api';

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
  locale = 'en',
  className = 'input',
}: {
  value: number | '';
  onChange: (categoryId: number) => void;
  locale?: string;
  className?: string;
}) {
  const { data: tree } = useQuery({ queryKey: ['category-tree'], queryFn: () => categoriesApi.tree() });
  const roots: CategoryNode[] = tree ?? [];

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      <option value="" disabled>
        Select a category…
      </option>
      {roots.map((root) =>
        root.children.length > 0 ? (
          <optgroup key={root.key} label={categoryLabel(root, locale)}>
            <option value={root.id}>{categoryLabel(root, locale)} (general)</option>
            {root.children.map((child) => (
              <option key={child.key} value={child.id}>
                {categoryLabel(child, locale)}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={root.key} value={root.id}>
            {categoryLabel(root, locale)}
          </option>
        ),
      )}
    </select>
  );
}
