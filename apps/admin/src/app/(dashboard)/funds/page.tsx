'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CheckCircle2, Landmark, PauseCircle, Plus, Send, UserPlus, X } from 'lucide-react';
import { fundsApi, governanceApi, transparencyApi } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

/** W7-E3-S2 — monthly intake/outflow trend rows from the ledger read layer. */
function FundTrends({ fundId }: { fundId: number }) {
  const { t } = useLanguage();
  const { data } = useQuery({
    queryKey: ['fund-trends', fundId],
    queryFn: () => transparencyApi.fundTrends(fundId),
  });
  const months = data?.data ?? [];
  if (months.length === 0) return null;
  const peak = Math.max(...months.map((m: any) => Math.max(m.intake, m.outflow)), 1);
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-500 uppercase">{t('funds.trends.heading')}</div>
      {months.map((m: any) => (
        <div key={m.month} className="flex items-center gap-2 text-xs">
          <span className="w-16 text-gray-500 font-mono">{m.month}</span>
          <div className="flex-1 space-y-0.5">
            <div className="h-1.5 rounded bg-emerald-500" style={{ width: `${(m.intake / peak) * 100}%` }} />
            <div className="h-1.5 rounded bg-amber-500" style={{ width: `${(m.outflow / peak) * 100}%` }} />
          </div>
          <span className="w-32 text-right text-gray-500">+{Number(m.intake).toLocaleString()} / −{Number(m.outflow).toLocaleString()}</span>
        </div>
      ))}
      <p className="text-[10px] text-gray-400">{t('funds.trends.legend')}</p>
    </div>
  );
}

const FUND_ROLES = ['fund_director', 'fund_deputy', 'fund_secretary', 'fund_accountant', 'fund_controller'];
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  frozen: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
};
const ALLOC_BADGE: Record<string, string> = {
  proposed: 'bg-yellow-100 text-yellow-800',
  board_approved: 'bg-blue-100 text-blue-700',
  disbursing: 'bg-orange-100 text-orange-700',
  reconciled: 'bg-purple-100 text-purple-700',
  closed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};

/**
 * W5-E7 — fund dashboards & operations: balance/intake/allocations/spend,
 * officer management, and the allocation cycle (propose → Board decision →
 * disburse tranches → reconcile → close). Board view of all funds.
 */
export default function FundsPage() {
  const { t } = useLanguage();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', purpose: '' });
  const [officer, setOfficer] = useState({ userId: '', role: 'fund_director' });
  const [proposal, setProposal] = useState({ projectId: '', amount: '', note: '' });
  const [tranche, setTranche] = useState<Record<number, string>>({});

  const { data: funds } = useQuery({ queryKey: ['funds'], queryFn: () => fundsApi.list() });
  const { data: dashboard } = useQuery({
    queryKey: ['fund-dashboard', selectedId],
    queryFn: () => fundsApi.dashboard(selectedId!),
    enabled: selectedId != null,
  });
  const { data: detail } = useQuery({
    queryKey: ['fund-detail', selectedId],
    queryFn: () => fundsApi.detail(selectedId!),
    enabled: selectedId != null,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['funds'] });
    qc.invalidateQueries({ queryKey: ['fund-dashboard'] });
    qc.invalidateQueries({ queryKey: ['fund-detail'] });
  };
  const onError = (err: any) => {
    const data = err?.response?.data;
    const details = Array.isArray(data?.errors) ? `: ${data.errors.join('; ')}` : '';
    toastError(`${data?.message || t('common.failed')}${details}`);
  };
  const mutate = (fn: () => Promise<any>, message: string) =>
    fn().then(() => { success(message); refresh(); }).catch(onError);

  const createMutation = useMutation({
    mutationFn: () => fundsApi.create(form),
    onSuccess: () => { success(t('funds.toast.created')); setCreateOpen(false); setForm({ name: '', purpose: '' }); refresh(); },
    onError,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-primary-600" />
          <h1 className="text-lg font-semibold">{t('funds.title')}</h1>
          <span className="text-sm text-gray-400">{t('funds.subtitle')}</span>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary btn-md gap-2">
          <Plus className="w-4 h-4" /> {t('funds.newFund')}
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {(funds ?? []).map((fund: any) => (
          <button key={fund.id} onClick={() => setSelectedId(fund.id)} className="card p-5 text-left hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{fund.name}</p>
              <span className={cn('badge', STATUS_BADGE[fund.status])}>{fund.status}</span>
            </div>
            <p className="text-2xl font-bold mt-2">{Number(fund.balance).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">
              {t('funds.card.officersAllocations', { officers: fund._count.memberships, allocations: fund._count.allocations })}
            </p>
          </button>
        ))}
        {(funds ?? []).length === 0 && <p className="text-gray-400 text-sm col-span-3">{t('funds.empty')}</p>}
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setCreateOpen(false)}>
          <div className="card p-6 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold">{t('funds.newFund')}</h2>
            <input className="input w-full" placeholder={t('funds.createModal.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input w-full" placeholder={t('funds.createModal.purposePlaceholder')} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            <p className="text-xs text-gray-400">{t('funds.createModal.launchCeilingNote')}</p>
            <button className="btn-primary btn-md w-full" disabled={!form.name} onClick={() => createMutation.mutate()}>{t('common.create')}</button>
          </div>
        </div>
      )}

      {/* Fund drawer */}
      {selectedId != null && dashboard && detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedId(null)}>
          <div className="w-full max-w-2xl h-full bg-white dark:bg-gray-900 shadow-xl overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Banknote className="w-4 h-4" /> {dashboard.fund.name}
                <span className={cn('badge', STATUS_BADGE[dashboard.fund.status])}>{dashboard.fund.status}</span>
              </h2>
              <button onClick={() => setSelectedId(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>

            {/* Dashboard tiles */}
            <div className="grid grid-cols-4 gap-3">
              {[
                [t('funds.drawer.tileBalance'), dashboard.balance],
                [t('funds.drawer.tileIntake'), dashboard.intake],
                [t('funds.drawer.tileAllocated'), dashboard.allocated],
                [t('funds.drawer.tileDisbursed'), dashboard.disbursed],
              ].map(([label, value]) => (
                <div key={label as string} className="card p-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-lg font-bold">{Number(value).toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* Freeze / unfreeze + W7 statement export */}
            <div className="flex gap-2 items-center">
              {dashboard.fund.status === 'active' ? (
                <button className="btn-secondary btn-sm gap-1" onClick={() => mutate(() => fundsApi.update(selectedId, { status: 'frozen' }), t('funds.toast.frozen'))}>
                  <PauseCircle className="w-3 h-3" /> {t('funds.actions.freeze')}
                </button>
              ) : dashboard.fund.status === 'frozen' ? (
                <button className="btn-secondary btn-sm gap-1" onClick={() => mutate(() => fundsApi.update(selectedId, { status: 'active' }), t('funds.toast.reactivated'))}>
                  <CheckCircle2 className="w-3 h-3" /> {t('funds.actions.reactivate')}
                </button>
              ) : null}
              <a
                className="btn-secondary btn-sm"
                href={transparencyApi.fundStatementUrl(selectedId)}
                target="_blank"
                rel="noreferrer"
              >
                {t('funds.actions.statementCsv')}
              </a>
            </div>

            {/* W7: monthly trends from the ledger */}
            <FundTrends fundId={selectedId} />

            {/* Officers */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase">{t('funds.drawer.officersHeading')}</div>
              {detail.memberships.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between text-sm border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2">
                  <span>{m.user?.email}</span>
                  <span className="flex gap-1">
                    {m.roles.map((r: string) => (
                      <span key={r} className="badge bg-primary-100 text-primary-800 gap-1">
                        {r.replace('fund_', '')}
                        <button onClick={() => mutate(() => fundsApi.removeOfficer(selectedId, m.userId, r), t('funds.toast.roleRevoked'))}>×</button>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
              <div className="flex gap-2">
                <input className="input" placeholder={t('funds.officer.userIdPlaceholder')} value={officer.userId} onChange={(e) => setOfficer({ ...officer, userId: e.target.value })} />
                <select className="input" value={officer.role} onChange={(e) => setOfficer({ ...officer, role: e.target.value })}>
                  {FUND_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button
                  className="btn-secondary btn-sm gap-1"
                  disabled={!officer.userId}
                  onClick={() => mutate(() => fundsApi.addOfficer(selectedId, Number(officer.userId), officer.role), t('funds.toast.officerAdded'))}
                >
                  <UserPlus className="w-3 h-3" /> {t('funds.actions.add')}
                </button>
              </div>
            </div>

            {/* Propose allocation */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase">{t('funds.propose.heading')}</div>
              <div className="grid grid-cols-4 gap-2">
                <input className="input" placeholder={t('funds.propose.projectIdPlaceholder')} value={proposal.projectId} onChange={(e) => setProposal({ ...proposal, projectId: e.target.value })} />
                <input className="input" placeholder={t('funds.propose.amountPlaceholder')} value={proposal.amount} onChange={(e) => setProposal({ ...proposal, amount: e.target.value })} />
                <input className="input" placeholder={t('funds.propose.notePlaceholder')} value={proposal.note} onChange={(e) => setProposal({ ...proposal, note: e.target.value })} />
                <button
                  className="btn-primary btn-sm gap-1"
                  disabled={!proposal.projectId || !proposal.amount}
                  onClick={() =>
                    mutate(
                      () => fundsApi.propose(selectedId, { projectId: Number(proposal.projectId), amount: Number(proposal.amount), note: proposal.note || undefined }),
                      t('funds.toast.allocationProposed'),
                    ).then(() => setProposal({ projectId: '', amount: '', note: '' }))
                  }
                >
                  <Send className="w-3 h-3" /> {t('funds.propose.submit')}
                </button>
              </div>
            </div>

            {/* Allocations */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase">{t('funds.allocations.heading')}</div>
              {detail.allocations.map((a: any) => (
                <div key={a.id} className="border border-gray-100 dark:border-gray-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {t('funds.allocations.rowSummary', { id: a.id, projectId: a.projectId, amount: Number(a.amount).toLocaleString() })}
                    </span>
                    <span className={cn('badge', ALLOC_BADGE[a.status])}>{a.status}</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {t('funds.allocations.disbursedOf', { disbursed: a.disbursed, amount: Number(a.amount).toLocaleString() })}
                    {a.note ? ` · ${a.note}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {a.status === 'proposed' && (
                      <>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() =>
                            mutate(
                              () =>
                                governanceApi
                                  .recordDecision({
                                    subjectType: 'fund_allocation',
                                    subjectId: a.id,
                                    decision: 'approved',
                                    rationale: t('funds.allocations.approveRationale', { id: a.id }),
                                  })
                                  .then(() => fundsApi.approve(a.id)),
                              t('funds.toast.decisionApproved'),
                            )
                          }
                        >
                          {t('funds.actions.decideApprove')}
                        </button>
                      </>
                    )}
                    {['board_approved', 'disbursing'].includes(a.status) && (
                      <>
                        <input
                          className="input w-24 text-xs"
                          placeholder={t('funds.actions.tranchePlaceholder')}
                          value={tranche[a.id] ?? ''}
                          onChange={(e) => setTranche({ ...tranche, [a.id]: e.target.value })}
                        />
                        <button
                          className="btn-secondary btn-sm"
                          disabled={!tranche[a.id]}
                          onClick={() => mutate(() => fundsApi.disburse(a.id, Number(tranche[a.id])), t('funds.toast.trancheDisbursed'))}
                        >
                          {t('funds.actions.disburse')}
                        </button>
                      </>
                    )}
                    {a.status === 'disbursing' && a.disbursed === Number(a.amount) && (
                      <button className="btn-secondary btn-sm" onClick={() => mutate(() => fundsApi.reconcile(a.id), t('funds.toast.reconciled'))}>{t('funds.actions.reconcile')}</button>
                    )}
                    {a.status === 'reconciled' && (
                      <button className="btn-secondary btn-sm" onClick={() => mutate(() => fundsApi.close(a.id), t('funds.toast.closed'))}>{t('funds.actions.close')}</button>
                    )}
                  </div>
                </div>
              ))}
              {detail.allocations.length === 0 && <p className="text-xs text-gray-400">{t('funds.allocations.empty')}</p>}
            </div>

            {/* Recent statement */}
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                <Landmark className="w-3 h-3" /> {t('funds.statement.heading')}
              </div>
              {(dashboard.statement ?? []).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 border-b border-gray-50 dark:border-gray-800 py-1">
                  <span className="truncate flex-1">{e.description}</span>
                  <span className={e.direction === 'credit' ? 'text-green-600' : 'text-red-600'}>
                    {e.direction === 'credit' ? '+' : '−'}{e.amount}
                  </span>
                  <span className="w-20 text-right font-medium">{e.runningBalance}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
