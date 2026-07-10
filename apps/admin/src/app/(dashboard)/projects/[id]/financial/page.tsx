'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { financialApi } from '@/lib/api';
import { useLanguage } from '@/contexts/language-context';
import { useAuth } from '@/contexts/auth-context';
import { cn, formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Loader2, TrendingUp, TrendingDown, DollarSign, ArrowLeft } from 'lucide-react';

type Tab = 'summary' | 'budgets' | 'expenses' | 'transactions';

const EXPENSE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const TX_TYPE_COLORS: Record<string, string> = {
  income: 'text-green-600 dark:text-green-400',
  expense: 'text-red-500 dark:text-red-400',
  refund: 'text-blue-500 dark:text-blue-400',
  adjustment: 'text-yellow-500 dark:text-yellow-400',
};

function Modal({ title, onClose, onSave, saving, children }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-4">{children}</div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
          <button onClick={onSave} disabled={saving} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: any) {
  const { locale } = useLanguage();
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        <div className={cn('p-2 rounded-lg', color)}><Icon className="w-4 h-4 text-white" /></div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(Number(value), undefined, locale)}</p>
    </div>
  );
}

export default function FinancialPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const role = user?.admin?.role || '';

  const [tab, setTab] = useState<Tab>('summary');
  const [summary, setSummary] = useState<any>(null);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [modal, setModal] = useState<null | 'budget' | 'expense' | 'transaction' | 'expense-status'>(null);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  const canFinancial = role === 'administrator' || role === 'financial_officer';
  const canEmployee = role === 'administrator' || role === 'employee';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sm, bg, ex, tx] = await Promise.all([
        financialApi.getSummary(projectId),
        financialApi.listBudgets(projectId),
        financialApi.listExpenses(projectId),
        financialApi.listTransactions(projectId),
      ]);
      setSummary(sm);
      setBudgets(bg || []);
      setExpenses(ex || []);
      setTransactions(tx || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      if (modal === 'budget') {
        if (editing) await financialApi.updateBudget(projectId, editing.id, form);
        else await financialApi.createBudget(projectId, form);
      } else if (modal === 'expense') {
        if (editing) await financialApi.updateExpense(projectId, editing.id, form);
        else await financialApi.createExpense(projectId, form);
      } else if (modal === 'transaction') {
        await financialApi.createTransaction(projectId, form);
      } else if (modal === 'expense-status') {
        await financialApi.updateExpenseStatus(projectId, editing.id, form.status);
      }
      setModal(null);
      load();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const openStatusModal = (expense: any, status: string) => {
    setEditing(expense);
    setForm({ status });
    setModal('expense-status');
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'summary', label: t('financial.summary') },
    { key: 'budgets', label: t('financial.budgets') },
    { key: 'expenses', label: t('financial.expenses') },
    { key: 'transactions', label: t('financial.transactions') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('financial.title')}</h1>
        </div>
        <div className="flex gap-2">
          {canFinancial && tab === 'budgets' && (
            <button onClick={() => { setEditing(null); setForm({}); setModal('budget'); }} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
              <Plus className="w-4 h-4" />{t('financial.addBudget')}
            </button>
          )}
          {canEmployee && tab === 'expenses' && (
            <button onClick={() => { setEditing(null); setForm({}); setModal('expense'); }} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
              <Plus className="w-4 h-4" />{t('financial.addExpense')}
            </button>
          )}
          {canFinancial && tab === 'transactions' && (
            <button onClick={() => { setForm({}); setModal('transaction'); }} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
              <Plus className="w-4 h-4" />{t('financial.addTransaction')}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 flex gap-6">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} className={cn('pb-3 text-sm font-medium border-b-2 transition-colors', tab === key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          {tab === 'summary' && summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SummaryCard label={t('financial.totalIncome')} value={summary.totalIncome} icon={TrendingUp} color="bg-green-500" />
              <SummaryCard label={t('financial.totalExpense')} value={summary.totalExpense} icon={TrendingDown} color="bg-red-500" />
              <SummaryCard label={t('financial.balance')} value={summary.balance} icon={DollarSign} color="bg-blue-500" />
              <SummaryCard label={t('financial.estimatedAmount')} value={summary.estimatedBudget} icon={DollarSign} color="bg-yellow-500" />
              <SummaryCard label={t('financial.approvedAmount')} value={summary.approvedBudget} icon={DollarSign} color="bg-purple-500" />
              <SummaryCard label={t('financial.actualSpent')} value={summary.actualSpent} icon={DollarSign} color="bg-gray-500" />
            </div>
          )}

          {/* Budgets */}
          {tab === 'budgets' && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {budgets.length === 0 ? (
                <p className="text-center py-12 text-gray-400">{t('financial.noBudgets')}</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Name', t('financial.estimatedAmount'), t('financial.approvedAmount'), t('financial.actualSpent'), ''].map((h, i) => (
                        <th key={i} className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {budgets.map((b) => (
                      <tr key={b.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 px-4 font-medium text-sm">{b.block?.translations?.[0]?.name || `Budget #${b.id}`}</td>
                        <td className="py-3 px-4 text-sm">{formatCurrency(Number(b.estimatedAmount), undefined, locale)}</td>
                        <td className="py-3 px-4 text-sm">{b.approvedAmount ? formatCurrency(Number(b.approvedAmount), undefined, locale) : '—'}</td>
                        <td className="py-3 px-4 text-sm">{formatCurrency(Number(b.actualAmount), undefined, locale)}</td>
                        <td className="py-3 px-4">
                          {canFinancial && (
                            <div className="flex gap-1">
                              <button onClick={() => { setEditing(b); setForm({ estimatedAmount: Number(b.estimatedAmount), approvedAmount: Number(b.approvedAmount) }); setModal('budget'); }} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={async () => { if (confirm('Delete?')) { await financialApi.deleteBudget(projectId, b.id); load(); } }} className="p-1.5 text-red-400 hover:bg-red-50 rounded">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Expenses */}
          {tab === 'expenses' && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {expenses.length === 0 ? (
                <p className="text-center py-12 text-gray-400">{t('financial.noExpenses')}</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Name', t('financial.amount'), t('financial.invoiceRef'), 'Status', t('financial.budget'), ''].map((h, i) => (
                        <th key={i} className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 px-4 font-medium text-sm">{e.block?.translations?.[0]?.name || `Expense #${e.id}`}</td>
                        <td className="py-3 px-4 text-sm font-medium">{formatCurrency(Number(e.amount), undefined, locale)}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{e.invoiceRef || '—'}</td>
                        <td className="py-3 px-4">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', EXPENSE_STATUS_COLORS[e.status])}>
                            {t(`financial.expenseStatuses.${e.status}`) || e.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-500">{e.budget?.block?.translations?.[0]?.name || '—'}</td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1">
                            {canEmployee && e.status === 'pending' && (
                              <button onClick={() => { setEditing(e); setForm({ amount: Number(e.amount), invoiceRef: e.invoiceRef }); setModal('expense'); }} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canFinancial && e.status === 'pending' && (
                              <>
                                <button onClick={() => openStatusModal(e, 'approved')} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">
                                  {t('financial.approve')}
                                </button>
                                <button onClick={() => openStatusModal(e, 'rejected')} className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200">
                                  {t('financial.reject')}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Transactions */}
          {tab === 'transactions' && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {transactions.length === 0 ? (
                <p className="text-center py-12 text-gray-400">{t('financial.noTransactions')}</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Type', t('financial.amount'), 'Reference', t('financial.notes'), 'Date'].map((h, i) => (
                        <th key={i} className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx: any) => (
                      <tr key={tx.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 px-4">
                          <span className={cn('text-sm font-medium capitalize', TX_TYPE_COLORS[tx.type])}>
                            {t(`financial.transactionTypes.${tx.type}`) || tx.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm font-medium">{formatCurrency(Number(tx.amount), undefined, locale)}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{tx.referenceType ? `${tx.referenceType}#${tx.referenceId}` : '—'}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{tx.notes || '—'}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{new Date(tx.createdAt).toLocaleDateString(locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Budget Modal */}
      {modal === 'budget' && (
        <Modal title={editing ? t('financial.editBudget') : t('financial.addBudget')} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <Field label="Block ID">
            <input type="number" value={form.blockId || ''} onChange={(e) => setForm({ ...form, blockId: Number(e.target.value) })} className={INPUT} placeholder="Block ID for content" />
          </Field>
          <Field label={t('financial.estimatedAmount')}>
            <input type="number" min={0} step="0.01" value={form.estimatedAmount || ''} onChange={(e) => setForm({ ...form, estimatedAmount: Number(e.target.value) })} className={INPUT} />
          </Field>
          <Field label={t('financial.approvedAmount')}>
            <input type="number" min={0} step="0.01" value={form.approvedAmount || ''} onChange={(e) => setForm({ ...form, approvedAmount: Number(e.target.value) })} className={INPUT} />
          </Field>
        </Modal>
      )}

      {/* Expense Modal */}
      {modal === 'expense' && (
        <Modal title={editing ? t('financial.editExpense') : t('financial.addExpense')} onClose={() => setModal(null)} onSave={save} saving={saving}>
          {!editing && (
            <Field label="Block ID">
              <input type="number" value={form.blockId || ''} onChange={(e) => setForm({ ...form, blockId: Number(e.target.value) })} className={INPUT} placeholder="Block ID for content" />
            </Field>
          )}
          <Field label={t('financial.budget')}>
            <select value={form.budgetId || ''} onChange={(e) => setForm({ ...form, budgetId: e.target.value ? Number(e.target.value) : undefined })} className={INPUT}>
              <option value="">None</option>
              {budgets.map((b) => <option key={b.id} value={b.id}>{b.block?.translations?.[0]?.name || `Budget #${b.id}`}</option>)}
            </select>
          </Field>
          <Field label={t('financial.amount')}>
            <input type="number" min={0} step="0.01" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className={INPUT} />
          </Field>
          <Field label={t('financial.invoiceRef')}>
            <input type="text" value={form.invoiceRef || ''} onChange={(e) => setForm({ ...form, invoiceRef: e.target.value })} className={INPUT} />
          </Field>
        </Modal>
      )}

      {/* Transaction Modal */}
      {modal === 'transaction' && (
        <Modal title={t('financial.addTransaction')} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <Field label={t('financial.transactionType')}>
            <select value={form.type || 'adjustment'} onChange={(e) => setForm({ ...form, type: e.target.value })} className={INPUT}>
              {['income', 'expense', 'refund', 'adjustment'].map((type) => (
                <option key={type} value={type}>{t(`financial.transactionTypes.${type}`) || type}</option>
              ))}
            </select>
          </Field>
          <Field label={t('financial.amount')}>
            <input type="number" min={0} step="0.01" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className={INPUT} />
          </Field>
          <Field label={t('financial.notes')}>
            <textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT} rows={3} />
          </Field>
        </Modal>
      )}

      {/* Expense Status Confirm Modal */}
      {modal === 'expense-status' && (
        <Modal title={form.status === 'approved' ? t('financial.approve') : t('financial.reject')} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Are you sure you want to <strong>{form.status}</strong> this expense?
            {form.status === 'approved' && ' This will create a transaction entry in the ledger.'}
          </p>
        </Modal>
      )}
    </div>
  );
}
