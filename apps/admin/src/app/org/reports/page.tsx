'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, FilePlus2, FileText, Send, X } from 'lucide-react';
import { agreementsApi, orgReportsApi, projectsApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/ui/toaster';
import { cn, formatDatetime } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

const STATUS_BADGE: Record<string, string> = {
  submitted: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-800',
  returned: 'bg-red-100 text-red-700',
};

/**
 * W6-E6-S1 — the organization reporting workspace: compose and submit
 * progress/financial reports (per agreement schedule or ad hoc), track
 * review status, resubmit returned reports, and see upcoming/overdue
 * obligations from active funding agreements.
 */
export default function OrgReportsPage() {
  const { t, locale } = useLanguage();
  const { activeOrg } = useAuth();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const orgId = activeOrg?.id;

  const [composing, setComposing] = useState(false);
  const [resubmitting, setResubmitting] = useState<any | null>(null);
  const [form, setForm] = useState({
    type: 'progress' as 'progress' | 'financial',
    title: '',
    projectId: '',
    fundingAgreementId: '',
    periodStart: '',
    periodEnd: '',
    narrative: '',
  });

  const { data: reports } = useQuery({
    queryKey: ['org-reports', orgId],
    queryFn: () => orgReportsApi.listForOrg(orgId!),
    enabled: !!orgId,
  });
  const { data: agreements } = useQuery({
    queryKey: ['org-agreements', orgId],
    queryFn: () => agreementsApi.listForOrg(orgId!),
    enabled: !!orgId,
  });
  const { data: projects } = useQuery({
    queryKey: ['org-projects-for-reports'],
    queryFn: () => projectsApi.list({ limit: 100 }),
    enabled: composing,
  });
  // obligations ride the agreement detail (active agreements only)
  const activeAgreements = (agreements ?? []).filter((a: any) => a.status === 'active');
  const { data: obligations } = useQuery({
    queryKey: ['org-agreement-obligations', orgId, activeAgreements.map((a: any) => a.id).join(',')],
    queryFn: async () => {
      const details = await Promise.all(activeAgreements.map((a: any) => agreementsApi.detail(a.id)));
      return details.flatMap((d: any) =>
        (d.obligations ?? [])
          .filter((o: any) => !o.satisfied)
          .map((o: any) => ({ ...o, agreementId: d.id, agreementTitle: d.title })),
      );
    },
    enabled: activeAgreements.length > 0,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['org-reports', orgId] });
    qc.invalidateQueries({ queryKey: ['org-agreement-obligations', orgId] });
  };
  const onError = (err: any) => toastError(err?.response?.data?.message || t('common.failed'));

  const submit = useMutation({
    mutationFn: () =>
      orgReportsApi.submit(orgId!, {
        type: form.type,
        title: form.title,
        projectId: form.projectId ? Number(form.projectId) : undefined,
        fundingAgreementId: form.fundingAgreementId ? Number(form.fundingAgreementId) : undefined,
        periodStart: form.periodStart ? new Date(form.periodStart).toISOString() : undefined,
        periodEnd: form.periodEnd ? new Date(form.periodEnd).toISOString() : undefined,
        payload: form.narrative ? { narrative: form.narrative } : {},
      }),
    onSuccess: () => { success(t('orgReports.toast.submitted')); setComposing(false); refresh(); },
    onError,
  });

  const resubmit = useMutation({
    mutationFn: () =>
      orgReportsApi.resubmit(resubmitting.id, {
        payload: { ...(resubmitting.payload ?? {}), narrative: form.narrative },
      }),
    onSuccess: () => { success(t('orgReports.toast.resubmitted')); setResubmitting(null); refresh(); },
    onError,
  });

  if (!orgId) return <div className="card p-8 text-center text-gray-500">{t('orgReports.selectOrgWorkspace')}</div>;

  const rows = reports ?? [];
  const openObligations = obligations ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary-600" />
          <h1 className="text-lg font-semibold">{t('orgReports.heading')}</h1>
          <span className="text-sm text-gray-400">{t('orgReports.subtitle')}</span>
        </div>
        <button className="btn-primary btn-md gap-2" onClick={() => { setForm({ ...form, title: '', narrative: '' }); setComposing(true); }}>
          <FilePlus2 className="w-4 h-4" /> {t('orgReports.newReport')}
        </button>
      </div>

      {/* Obligation calendar (due/overdue from agreement schedules) */}
      {openObligations.length > 0 && (
        <div className="card p-4 space-y-2 border-l-4 border-amber-500">
          <div className="flex items-center gap-2 font-medium text-amber-700">
            <AlarmClock className="w-4 h-4" /> {t('orgReports.obligationsHeading')}
          </div>
          {openObligations.map((o: any, i: number) => (
            <div key={i} className="text-sm text-gray-600 flex items-center gap-2">
              <span className={cn('badge text-xs', o.overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800')}>
                {o.overdue ? t('orgReports.overdue') : t('orgReports.due')}
              </span>
              {t('orgReports.obligationLine', { type: t(`orgReports.reportTypes.${o.type}`) || o.type, start: formatDatetime(o.periodStart, locale), end: formatDatetime(o.periodEnd, locale) })}
              <span className="text-xs text-gray-400">{t('orgReports.obligationDueNote', { agreementTitle: o.agreementTitle, dueAt: formatDatetime(o.dueAt, locale) })}</span>
            </div>
          ))}
          <p className="text-xs text-amber-600">{t('orgReports.overdueWarning')}</p>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">{t('orgReports.colReport')}</th>
              <th className="table-header">{t('orgReports.colType')}</th>
              <th className="table-header">{t('orgReports.colAgreement')}</th>
              <th className="table-header">{t('orgReports.colSubmitted')}</th>
              <th className="table-header">{t('common.status')}</th>
              <th className="table-header">{t('orgReports.colReviewNote')}</th>
              <th className="table-header">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-gray-400">{t('orgReports.noReportsYet')}</td></tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td className="table-cell font-medium">{r.title}</td>
                <td className="table-cell"><span className="badge bg-gray-100 text-gray-600">{t(`orgReports.reportTypes.${r.type}`) || r.type}</span></td>
                <td className="table-cell text-sm text-gray-500">{r.fundingAgreement?.title ?? '—'}</td>
                <td className="table-cell text-sm text-gray-500">{formatDatetime(r.submittedAt, locale)}</td>
                <td className="table-cell">
                  <span className={cn('badge', STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-500')}>{t(`orgReports.statuses.${r.status}`) || r.status}</span>
                </td>
                <td className="table-cell text-sm text-gray-600 max-w-xs truncate" title={r.reviewNote ?? ''}>
                  {r.reviewNote ?? '—'}
                </td>
                <td className="table-cell">
                  {r.status === 'returned' && (
                    <button
                      className="btn-secondary btn-sm gap-1"
                      onClick={() => { setForm({ ...form, narrative: r.payload?.narrative ?? '' }); setResubmitting(r); }}
                    >
                      <Send className="w-3 h-3" /> {t('orgReports.correctResubmit')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Composer */}
      {composing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setComposing(false)}>
          <div className="card p-6 w-full max-w-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('orgReports.composerTitle')}</h2>
              <button onClick={() => setComposing(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
                <option value="progress">{t('orgReports.reportTypes.progress')}</option>
                <option value="financial">{t('orgReports.reportTypes.financial')}</option>
              </select>
              <select className="input" value={form.fundingAgreementId} onChange={(e) => setForm({ ...form, fundingAgreementId: e.target.value })}>
                <option value="">{t('orgReports.noAgreementAdHoc')}</option>
                {(agreements ?? []).map((a: any) => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
            <input className="input w-full" placeholder={t('orgReports.titlePlaceholder')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('orgReports.periodStart')}</label>
                <input type="date" className="input" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
              </div>
              <div>
                <label className="label">{t('orgReports.periodEnd')}</label>
                <input type="date" className="input" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
              </div>
            </div>
            <select className="input w-full" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">{t('orgReports.noSpecificProject')}</option>
              {(projects?.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.block?.translations?.[0]?.name ?? `#${p.id}`}</option>
              ))}
            </select>
            <textarea
              className="input min-h-28 w-full"
              placeholder={t('orgReports.narrativePlaceholder')}
              value={form.narrative}
              onChange={(e) => setForm({ ...form, narrative: e.target.value })}
            />
            <button
              className="btn-primary btn-md w-full"
              disabled={!form.title.trim() || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {t('orgReports.submitToBoard')}
            </button>
          </div>
        </div>
      )}

      {/* Resubmit dialog */}
      {resubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setResubmitting(null)}>
          <div className="card p-6 w-full max-w-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('orgReports.resubmitTitle', { title: resubmitting.title })}</h2>
              <button onClick={() => setResubmitting(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-sm p-3 rounded bg-red-50 text-red-700">
              {t('orgReports.boardComments', { note: resubmitting.reviewNote })}
            </div>
            <textarea
              className="input min-h-28 w-full"
              value={form.narrative}
              onChange={(e) => setForm({ ...form, narrative: e.target.value })}
            />
            <button className="btn-primary btn-md w-full" disabled={resubmit.isPending} onClick={() => resubmit.mutate()}>
              {t('orgReports.resubmit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
