'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CheckCircle2, FileUp, Plus, Receipt, XCircle } from 'lucide-react';
import { expensesApi, fundsApi, invoicesApi, recipientsApi, type ExecutionStage, type ExpenseCategory, type RecipientInput } from '@/lib/api';
import { ProjectPicker } from '@/components/ui/project-picker';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';
import { useAuth } from '@/contexts/auth-context';

const CATEGORIES: ExpenseCategory[] = ['materials', 'labor', 'services', 'equipment', 'transport', 'administrative', 'other'];
const STAGES: ExecutionStage[] = ['planning', 'procurement', 'execution', 'inspection', 'completion'];
const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};
const isPositiveNumber = (s: string) => s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) > 0;

/**
 * W8 — successor to the legacy per-project expense flow. Every expense
 * answers who was paid, how much, why, for which project, from which fund,
 * and (once attached) which invoice supports it. Approving posts the ledger
 * debit against the fund's own account (see MoneyEventsSubscriber).
 */
export default function ExpensesPage() {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();

  const [filters, setFilters] = useState<{ projectId: number | ''; fundId: number | ''; status: string }>({ projectId: '', fundId: '', status: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [newRecipientOpen, setNewRecipientOpen] = useState(false);
  const [invoiceRowOpen, setInvoiceRowOpen] = useState<number | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<{ number: string; date: string; file: File | null }>({ number: '', date: '', file: null });

  const [form, setForm] = useState<{ fundId: number | ''; projectId: number | ''; amount: string; category: ExpenseCategory; description: string; recipientId: number | ''; notes: string; stage: ExecutionStage | '' }>({
    fundId: '', projectId: '', amount: '', category: 'materials', description: '', recipientId: '', notes: '', stage: '',
  });
  const [recipientForm, setRecipientForm] = useState<RecipientInput>({ name: '', type: 'person' });

  const { data: funds } = useQuery({ queryKey: ['funds'], queryFn: () => fundsApi.list() });
  const { data: recipients } = useQuery({ queryKey: ['recipients'], queryFn: () => recipientsApi.list() });
  const { data: expenses } = useQuery({
    queryKey: ['expenses', filters],
    queryFn: () =>
      expensesApi.list({
        projectId: filters.projectId || undefined,
        fundId: filters.fundId || undefined,
        status: filters.status || undefined,
      }),
  });

  const onError = (err: any) => {
    const data = err?.response?.data;
    toastError(data?.message || t('common.failed'));
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ['expenses'] });
  const mutate = (fn: () => Promise<any>, message: string) =>
    fn().then(() => { success(message); refresh(); }).catch(onError);

  const createRecipientMutation = useMutation({
    mutationFn: () => recipientsApi.create(recipientForm),
    onSuccess: (recipient) => {
      qc.invalidateQueries({ queryKey: ['recipients'] });
      setForm((f) => ({ ...f, recipientId: recipient.id }));
      setNewRecipientOpen(false);
      setRecipientForm({ name: '', type: 'person' });
    },
    onError,
  });

  const createExpenseMutation = useMutation({
    mutationFn: () =>
      expensesApi.create({
        fundId: Number(form.fundId),
        projectId: Number(form.projectId),
        amount: Number(form.amount),
        category: form.category,
        description: form.description,
        recipientId: Number(form.recipientId),
        notes: form.notes || undefined,
        stage: form.stage || undefined,
      }),
    onSuccess: () => {
      success(t('expenses.toast.created'));
      setCreateOpen(false);
      setForm({ fundId: '', projectId: '', amount: '', category: 'materials', description: '', recipientId: '', notes: '', stage: '' });
      refresh();
    },
    onError,
  });

  const uploadInvoiceMutation = useMutation({
    mutationFn: async (expenseId: number) => {
      if (!invoiceForm.file) throw new Error('no file');
      const fd = new FormData();
      fd.append('file', invoiceForm.file);
      fd.append('invoiceNumber', invoiceForm.number);
      fd.append('invoiceDate', invoiceForm.date || new Date().toISOString());
      const invoice = await invoicesApi.upload(fd);
      return expensesApi.attachInvoice(expenseId, invoice.id);
    },
    onSuccess: () => {
      success(t('expenses.toast.invoiceUploaded'));
      setInvoiceRowOpen(null);
      setInvoiceForm({ number: '', date: '', file: null });
      refresh();
    },
    onError,
  });

  const canSubmitExpense = form.fundId && form.projectId && isPositiveNumber(form.amount) && form.description && form.recipientId;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary-600" />
          <h1 className="text-lg font-semibold">{t('expenses.title')}</h1>
          <span className="text-sm text-gray-400">{t('expenses.subtitle')}</span>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary btn-md gap-2">
          <Plus className="w-4 h-4" /> {t('expenses.newExpense')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select className="input" value={filters.fundId} onChange={(e) => setFilters({ ...filters, fundId: e.target.value ? Number(e.target.value) : '' })}>
          <option value="">{t('expenses.filters.fund')}: {t('expenses.filters.all')}</option>
          {(funds ?? []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">{t('expenses.filters.status')}: {t('expenses.filters.all')}</option>
          {['pending', 'approved', 'rejected'].map((s) => <option key={s} value={s}>{t(`expenses.statuses.${s}`)}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="space-y-2">
        {(expenses ?? []).map((e: any) => (
          <div key={e.id} className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">
                  {Number(e.amount).toLocaleString(locale)} · {t(`expenses.categories.${e.category}`)}
                </p>
                <p className="text-xs text-gray-500">
                  {e.fund.name} → project #{e.projectId} · {e.recipient.name} ({t(`donors.types.${e.recipient.type}`)})
                  {e.stage && <> · {t(`expenses.stages.${e.stage}`)}</>}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{e.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={cn('badge', STATUS_BADGE[e.status])}>{t(`expenses.statuses.${e.status}`)}</span>
                {e.status === 'approved' && (
                  <span className="text-xs text-gray-400">
                    {e.paidAt ? t('expenses.paidOn', { date: new Date(e.paidAt).toLocaleDateString(locale) }) : t('expenses.notPaidYet')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {e.invoice ? (
                <a href={`${process.env.NEXT_PUBLIC_ADMIN_API_URL?.replace(/\/api$/, '') || 'http://localhost:4000'}${e.invoice.fileUrl}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm gap-1">
                  <FileUp className="w-3 h-3" /> {e.invoice.invoiceNumber}
                </a>
              ) : (
                <span className="text-xs text-gray-400">{t('expenses.invoice.noInvoice')}</span>
              )}
              {!e.invoice && (
                <button className="btn-secondary btn-sm gap-1" onClick={() => setInvoiceRowOpen(invoiceRowOpen === e.id ? null : e.id)}>
                  <FileUp className="w-3 h-3" /> {t('expenses.invoice.uploadLabel')}
                </button>
              )}
              {/* Server always enforces this (createdByUserId != actor, or Board/Council
                  exemption) — hiding the buttons for the common self-approval case avoids
                  showing an action that would just 403. */}
              {e.status === 'pending' && user?.id !== e.createdByUserId && (
                <>
                  <button className="btn-secondary btn-sm gap-1" onClick={() => mutate(() => expensesApi.approve(e.id), t('expenses.toast.approved'))}>
                    <CheckCircle2 className="w-3 h-3" /> {t('expenses.actions.approve')}
                  </button>
                  <button className="btn-secondary btn-sm gap-1" onClick={() => mutate(() => expensesApi.reject(e.id), t('expenses.toast.rejected'))}>
                    <XCircle className="w-3 h-3" /> {t('expenses.actions.reject')}
                  </button>
                </>
              )}
              {e.status === 'approved' && !e.paidAt && (
                <button className="btn-secondary btn-sm gap-1" onClick={() => mutate(() => expensesApi.markPaid(e.id), t('expenses.toast.markedPaid'))}>
                  <Banknote className="w-3 h-3" /> {t('expenses.actions.markPaid')}
                </button>
              )}
            </div>

            {invoiceRowOpen === e.id && (
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <input className="input" placeholder={t('expenses.invoice.numberPlaceholder')} value={invoiceForm.number} onChange={(ev) => setInvoiceForm({ ...invoiceForm, number: ev.target.value })} />
                <input type="date" className="input" value={invoiceForm.date} onChange={(ev) => setInvoiceForm({ ...invoiceForm, date: ev.target.value })} />
                <input type="file" onChange={(ev) => setInvoiceForm({ ...invoiceForm, file: ev.target.files?.[0] ?? null })} />
                <button
                  className="btn-primary btn-sm"
                  disabled={!invoiceForm.file || !invoiceForm.number}
                  onClick={() => uploadInvoiceMutation.mutate(e.id)}
                >
                  {t('expenses.invoice.attach')}
                </button>
              </div>
            )}
          </div>
        ))}
        {(expenses ?? []).length === 0 && <p className="text-gray-400 text-sm">{t('expenses.empty')}</p>}
      </div>

      {/* New expense modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setCreateOpen(false)}>
          <div className="card p-6 w-full max-w-lg space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold">{t('expenses.newExpense')}</h2>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={form.fundId} onChange={(e) => setForm({ ...form, fundId: e.target.value ? Number(e.target.value) : '' })}>
                <option value="">{t('expenses.createModal.fundLabel')}</option>
                {(funds ?? []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <ProjectPicker value={form.projectId} onChange={(p) => setForm({ ...form, projectId: p.id })} />
              <input className="input" placeholder={t('expenses.createModal.amountPlaceholder')} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`expenses.categories.${c}`)}</option>)}
              </select>
              <select
                className="input"
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value as ExecutionStage | '' })}
                aria-label={t('expenses.createModal.stageLabel')}
              >
                <option value="">{t('expenses.createModal.stageLabel')}</option>
                {STAGES.map((s) => <option key={s} value={s}>{t(`expenses.stages.${s}`)}</option>)}
              </select>
            </div>
            <textarea className="input w-full" rows={2} placeholder={t('expenses.createModal.descriptionPlaceholder')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <div className="space-y-1">
              <label className="text-xs text-gray-500">{t('expenses.createModal.recipientLabel')}</label>
              <div className="flex gap-2">
                <select className="input flex-1" value={form.recipientId} onChange={(e) => setForm({ ...form, recipientId: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">—</option>
                  {(recipients ?? []).map((r: any) => <option key={r.id} value={r.id}>{r.name} ({t(`donors.types.${r.type}`)})</option>)}
                </select>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setNewRecipientOpen(!newRecipientOpen)}>+</button>
              </div>
              {newRecipientOpen && (
                <div className="flex gap-2 pt-1">
                  <input className="input flex-1" placeholder={t('expenses.createModal.recipientNamePlaceholder')} value={recipientForm.name} onChange={(e) => setRecipientForm({ ...recipientForm, name: e.target.value })} />
                  <select className="input" value={recipientForm.type} onChange={(e) => setRecipientForm({ ...recipientForm, type: e.target.value as RecipientInput['type'] })}>
                    {(['person', 'company', 'organization'] as const).map((ty) => <option key={ty} value={ty}>{t(`donors.types.${ty}`)}</option>)}
                  </select>
                  <button type="button" className="btn-primary btn-sm" disabled={!recipientForm.name} onClick={() => createRecipientMutation.mutate()}>{t('common.create')}</button>
                </div>
              )}
            </div>

            <input className="input w-full" placeholder={t('expenses.createModal.notesPlaceholder')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button className="btn-primary btn-md w-full" disabled={!canSubmitExpense} onClick={() => createExpenseMutation.mutate()}>
              {t('expenses.createModal.submit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
