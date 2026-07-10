'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, UserPlus, X } from 'lucide-react';
import { organizationsApi, participationsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

const PROJECT_ROLES = ['contributor', 'project_lead', 'financial_delegate'];

/**
 * W6-E5 — joint projects: participating organizations and project-scope
 * grants (cross-org assignees), managed by the owner org or the Board.
 */
export function ParticipationsPanel({ projectId }: { projectId: number }) {
  const { t } = useLanguage();
  const ROLE_LABEL: Record<string, string> = {
    owner: t('participations.roles.owner'),
    executing_agency: t('participations.roles.executing_agency'),
    funding_partner: t('participations.roles.funding_partner'),
    supervising: t('participations.roles.supervising'),
    beneficiary_rep: t('participations.roles.beneficiary_rep'),
  };
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [granting, setGranting] = useState(false);
  const [form, setForm] = useState({ organizationId: '', role: 'executing_agency', notes: '' });
  const [grantForm, setGrantForm] = useState({ userId: '', role: 'contributor' });

  const { data: participations } = useQuery({
    queryKey: ['participations', projectId],
    queryFn: () => participationsApi.list(projectId),
  });
  const { data: assignable } = useQuery({
    queryKey: ['assignable-users', projectId],
    queryFn: () => participationsApi.assignable(projectId),
  });
  const { data: orgs } = useQuery({
    queryKey: ['organizations-all'],
    queryFn: () => organizationsApi.list({ limit: 100 }),
    enabled: adding,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['participations', projectId] });
    qc.invalidateQueries({ queryKey: ['assignable-users', projectId] });
    qc.invalidateQueries({ queryKey: ['project', projectId] });
  };
  const onError = (err: any) => toastError(err?.response?.data?.message || t('common.failed'));

  const addMutation = useMutation({
    mutationFn: () =>
      participationsApi.add(projectId, {
        organizationId: Number(form.organizationId),
        role: form.role,
        notes: form.notes || undefined,
      }),
    onSuccess: () => { success(t('participations.toast.orgAdded')); setAdding(false); refresh(); },
    onError,
  });
  const endMutation = useMutation({
    mutationFn: (participationId: number) => participationsApi.end(projectId, participationId),
    onSuccess: () => { success(t('participations.toast.participationEnded')); refresh(); },
    onError,
  });
  const grantMutation = useMutation({
    mutationFn: () => participationsApi.grant(projectId, { userId: Number(grantForm.userId), role: grantForm.role }),
    onSuccess: () => { success(t('participations.toast.roleGranted')); setGranting(false); refresh(); },
    onError,
  });

  const rows = participations ?? [];
  const grantHolders = (assignable ?? []).filter((u: any) => u.projectRoles.length > 0);

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Building2 className="w-4 h-4" /> {t('participations.heading')}
        </h3>
        <button className="btn-ghost btn-sm p-1" title={t('participations.addOrgTitle')} onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {rows.length === 0 && <p className="text-sm text-gray-400">{t('participations.ownerOnly')}</p>}
      {rows.map((p: any) => (
        <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-100">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{p.organization?.name}</p>
            <p className="text-xs text-gray-400">
              {ROLE_LABEL[p.role] ?? p.role}
              {p.status === 'ended' && <span className="text-red-400"> · {t('participations.ended')}</span>}
            </p>
          </div>
          {p.status === 'active' && (
            <button className="text-xs text-red-500 hover:underline flex-shrink-0" onClick={() => endMutation.mutate(p.id)}>
              {t('participations.end')}
            </button>
          )}
        </div>
      ))}

      <div className="pt-2 border-t border-gray-100 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-500">{t('participations.grantsHeading')}</p>
          <button className="btn-ghost btn-sm p-1" title={t('participations.grantTitle')} onClick={() => setGranting(true)}>
            <UserPlus className="w-4 h-4" />
          </button>
        </div>
        {grantHolders.length === 0 && <p className="text-xs text-gray-400">{t('participations.noneYet')}</p>}
        {grantHolders.map((u: any) => (
          <div key={u.userId} className="flex items-center justify-between text-xs">
            <span className="truncate">{u.name}</span>
            <span className="flex gap-1">
              {u.projectRoles.map((role: string) => (
                <button
                  key={role}
                  className="badge bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600"
                  title={t('participations.revokeHint')}
                  onClick={() =>
                    participationsApi.revoke(projectId, u.userId, role).then(() => { success(t('participations.toast.roleRevoked')); refresh(); }, onError)
                  }
                >
                  {t(`participations.projectRoles.${role}`) || role}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setAdding(false)}>
          <div className="card p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('participations.addOrgModalTitle')}</h2>
              <button onClick={() => setAdding(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <select className="input w-full" value={form.organizationId} onChange={(e) => setForm({ ...form, organizationId: e.target.value })}>
              <option value="" disabled>{t('participations.organizationPlaceholder')}</option>
              {(orgs?.data ?? []).map((o: any) => (
                <option key={o.id} value={o.id}>{o.name} ({o.type})</option>
              ))}
            </select>
            <select className="input w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input className="input w-full" placeholder={t('participations.notesPlaceholder')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button
              className="btn-primary btn-md w-full"
              disabled={!form.organizationId || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              {t('participations.addParticipation')}
            </button>
          </div>
        </div>
      )}

      {granting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setGranting(false)}>
          <div className="card p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('participations.grantTitle')}</h2>
              <button onClick={() => setGranting(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500">
              {t('participations.grantDescription')}
            </p>
            <input
              className="input w-full"
              placeholder={t('participations.userIdPlaceholder')}
              value={grantForm.userId}
              onChange={(e) => setGrantForm({ ...grantForm, userId: e.target.value })}
            />
            <select className="input w-full" value={grantForm.role} onChange={(e) => setGrantForm({ ...grantForm, role: e.target.value })}>
              {PROJECT_ROLES.map((role) => <option key={role} value={role}>{t(`participations.projectRoles.${role}`) || role}</option>)}
            </select>
            <button
              className="btn-primary btn-md w-full"
              disabled={!grantForm.userId || grantMutation.isPending}
              onClick={() => grantMutation.mutate()}
            >
              {t('participations.grantRoleSubmit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
