'use client';

import { useQuery } from '@tanstack/react-query';
import { fundsApi } from '@/lib/api';
import { useLanguage } from '@/contexts/language-context';

interface SuggestedFund {
  id: number;
  name: string;
  type: string;
}

interface SuggestedFunds {
  category: { id: number; key: string; name: string };
  masterFund: SuggestedFund | null;
  organizationFund: SuggestedFund | null;
  otherFunds: SuggestedFund[];
}

/**
 * W9 — project creation workflow, step 3 ("system suggests available funds,
 * user selects a default funding source"): fetches `GET /funds/suggested`
 * (FundHierarchyService.suggestedFunds, read-only — nothing is created by
 * this picker) and lets the user override the server's silent default
 * (the organization's fund for this sector, auto-created on first use).
 * Leaving the picker on "auto" sends no fundId — ProjectsService.create
 * resolves the same default either way.
 */
export function FundPicker({
  categoryId,
  organizationId,
  value,
  onChange,
}: {
  categoryId: number | '';
  organizationId?: number;
  value: number | '';
  onChange: (fundId: number | '') => void;
}) {
  const { t } = useLanguage();
  const { data } = useQuery<SuggestedFunds>({
    queryKey: ['suggested-funds', categoryId, organizationId],
    queryFn: () => fundsApi.suggested(Number(categoryId), organizationId),
    enabled: categoryId !== '',
  });

  if (categoryId === '') return null;

  const options: Array<SuggestedFund & { hint: string }> = [
    ...(data?.organizationFund ? [{ ...data.organizationFund, hint: t('fundPicker.suggestedOrgFund') }] : []),
    ...(data?.masterFund ? [{ ...data.masterFund, hint: t('fundPicker.masterFund') }] : []),
    ...(data?.otherFunds ?? []).map((f) => ({ ...f, hint: t(`funds.types.${f.type}`) })),
  ];

  return (
    <div>
      <label className="label">{t('fundPicker.label')}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}>
        <option value="">{t('fundPicker.autoOption')}</option>
        {options.map((f) => (
          <option key={f.id} value={f.id}>{f.name} — {f.hint}</option>
        ))}
      </select>
      <p className="text-xs text-gray-400 mt-1">{t('fundPicker.note')}</p>
    </div>
  );
}
