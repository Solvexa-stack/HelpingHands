'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, Plus, X } from 'lucide-react';
import { donorsApi, type DonorInput } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

const TYPE_BADGE: Record<string, string> = {
  person: 'bg-slate-100 text-slate-700',
  company: 'bg-blue-100 text-blue-700',
  organization: 'bg-indigo-100 text-indigo-700',
};

/**
 * W8 — donor master data + report (donations made, projects funded, spending
 * tracking), traced through Donor → FundDonation → Fund → FundAllocation →
 * Project / Fund → Expense.
 */
export default function DonorsPage() {
  const { t, locale } = useLanguage();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<DonorInput>({ name: '', type: 'person', contactEmail: '', contactPhone: '', contactAddress: '', taxId: '', notes: '' });

  const { data: donors } = useQuery({ queryKey: ['donors'], queryFn: () => donorsApi.list() });
  const { data: report } = useQuery({
    queryKey: ['donor-report', selectedId],
    queryFn: () => donorsApi.report(selectedId!),
    enabled: selectedId != null,
  });

  const onError = (err: any) => {
    const data = err?.response?.data;
    toastError(data?.message || t('common.failed'));
  };

  const createMutation = useMutation({
    mutationFn: () =>
      donorsApi.create({
        ...form,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        contactAddress: form.contactAddress || undefined,
        taxId: form.taxId || undefined,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      success(t('donors.toast.created'));
      setCreateOpen(false);
      setForm({ name: '', type: 'person', contactEmail: '', contactPhone: '', contactAddress: '', taxId: '', notes: '' });
      qc.invalidateQueries({ queryKey: ['donors'] });
    },
    onError,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HandCoins className="w-5 h-5 text-primary-600" />
          <h1 className="text-lg font-semibold">{t('donors.title')}</h1>
          <span className="text-sm text-gray-400">{t('donors.subtitle')}</span>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary btn-md gap-2">
          <Plus className="w-4 h-4" /> {t('donors.newDonor')}
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {(donors ?? []).map((donor: any) => (
          <button key={donor.id} onClick={() => setSelectedId(donor.id)} className="card p-5 text-start hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{donor.name}</p>
              <span className={cn('badge', TYPE_BADGE[donor.type])}>{t(`donors.types.${donor.type}`) || donor.type}</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {donor._count.funds} {t('donors.detail.fundsHeading').toLowerCase()} · {donor._count.donations} {t('donors.detail.donationsHeading').toLowerCase()}
            </p>
          </button>
        ))}
        {(donors ?? []).length === 0 && <p className="text-gray-400 text-sm col-span-3">{t('donors.empty')}</p>}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setCreateOpen(false)}>
          <div className="card p-6 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold">{t('donors.newDonor')}</h2>
            <input className="input w-full" placeholder={t('donors.createModal.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="input w-full" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DonorInput['type'] })}>
              {(['person', 'company', 'organization'] as const).map((ty) => <option key={ty} value={ty}>{t(`donors.types.${ty}`)}</option>)}
            </select>
            <input className="input w-full" placeholder={t('donors.createModal.emailPlaceholder')} value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <input className="input w-full" placeholder={t('donors.createModal.phonePlaceholder')} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            <input className="input w-full" placeholder={t('donors.createModal.addressPlaceholder')} value={form.contactAddress} onChange={(e) => setForm({ ...form, contactAddress: e.target.value })} />
            <input className="input w-full" placeholder={t('donors.createModal.taxIdPlaceholder')} value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
            <input className="input w-full" placeholder={t('donors.createModal.notesPlaceholder')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button className="btn-primary btn-md w-full" disabled={!form.name} onClick={() => createMutation.mutate()}>{t('donors.createModal.submit')}</button>
          </div>
        </div>
      )}

      {selectedId != null && report && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedId(null)}>
          <div className="w-full max-w-2xl h-full bg-white dark:bg-gray-900 shadow-xl overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <HandCoins className="w-4 h-4" /> {report.donor.name}
                <span className={cn('badge', TYPE_BADGE[report.donor.type])}>{t(`donors.types.${report.donor.type}`) || report.donor.type}</span>
              </h2>
              <button onClick={() => setSelectedId(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card p-3">
                <p className="text-xs text-gray-500">{t('donors.detail.totalDonated')}</p>
                <p className="text-lg font-bold">{Number(report.totalDonated).toLocaleString(locale)}</p>
              </div>
              <div className="card p-3">
                <p className="text-xs text-gray-500">{t('donors.detail.totalSpent')}</p>
                <p className="text-lg font-bold">{Number(report.totalSpent).toLocaleString(locale)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase">{t('donors.detail.donationsHeading')}</div>
              {report.donations.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between text-sm border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2">
                  <span>{d.fund.name} · {d.paymentMethod}</span>
                  <span className="font-medium">{Number(d.amount).toLocaleString(locale)} · {d.status}</span>
                </div>
              ))}
              {report.donations.length === 0 && <p className="text-xs text-gray-400">{t('donors.empty')}</p>}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase">{t('donors.detail.fundedProjectsHeading')}</div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {report.fundedProjectIds.length > 0 ? report.fundedProjectIds.map((id: number) => `#${id}`).join(', ') : t('donors.empty')}
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase">{t('donors.detail.spendingHeading')}</div>
              {report.spending.map((s: any) => (
                <div key={s.expenseId} className="flex items-center justify-between text-sm border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2">
                  <span>#{s.expenseId} · project #{s.projectId} · {s.recipient?.name}</span>
                  <span className="font-medium">{Number(s.amount).toLocaleString(locale)}</span>
                </div>
              ))}
              {report.spending.length === 0 && <p className="text-xs text-gray-400">{t('donors.empty')}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
