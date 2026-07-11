'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightCircle, Building2, CheckCircle2, PauseCircle, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { organizationsApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/ui/toaster';
import { cn, formatDate } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

const ORG_ROLES = ['org_admin', 'project_manager', 'staff', 'org_accountant', 'viewer'];

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending_verification: 'bg-yellow-100 text-yellow-800',
  suspended: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
};

export default function OrganizationsPage() {
  const { t, locale } = useLanguage();
  const { success, error: toastError } = useToast();
  const { contexts, activeOrgId, switchOrg } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ type: 'ngo', name: '', registrationNumber: '' });
  const [invite, setInvite] = useState({ email: '', firstName: '', lastName: '', password: '', role: 'org_admin' });
  const [activationUrl, setActivationUrl] = useState<string | null>(null);
  const [createdLogin, setCreatedLogin] = useState<string | null>(null);
  const [memberId, setMemberId] = useState('');
  const [roleByUser, setRoleByUser] = useState<Record<number, string>>({});

  const { data } = useQuery({ queryKey: ['organizations'], queryFn: () => organizationsApi.list({ limit: 100 }) });
  const { data: members } = useQuery({
    queryKey: ['org-members', selected?.id],
    queryFn: () => organizationsApi.members(selected.id),
    enabled: !!selected,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['organizations'] });
    qc.invalidateQueries({ queryKey: ['org-members'] });
  };
  const onError = (err: any) => {
    const data = err?.response?.data;
    const details = Array.isArray(data?.errors) ? `: ${data.errors.join('; ')}` : '';
    toastError(`${data?.message || t('common.failed')}${details}`);
  };

  const createMutation = useMutation({
    mutationFn: () => organizationsApi.create(form),
    onSuccess: () => { success(t('organizations.toast.orgCreated')); setCreateOpen(false); refresh(); },
    onError,
  });
  const inviteMutation = useMutation({
    mutationFn: () =>
      organizationsApi.inviteFirstAdmin(selected.id, {
        email: invite.email.trim(),
        firstName: invite.firstName.trim(),
        lastName: invite.lastName.trim(),
        role: invite.role,
        ...(invite.password ? { password: invite.password } : {}),
      }),
    onSuccess: (data: any) => {
      success(data?.message ?? t('orgTeam.toast.inviteSent'));
      setCreatedLogin(invite.password ? invite.email : null);
      setActivationUrl(data?.activationUrl ?? null); // dev-only field (link mode)
      setInvite({ email: '', firstName: '', lastName: '', password: '', role: 'org_admin' });
      refresh();
    },
    onError,
  });
  const addMemberMutation = useMutation({
    mutationFn: () => organizationsApi.addMember(selected.id, Number(memberId)),
    onSuccess: () => { success(t('organizations.toast.memberAdded')); setMemberId(''); refresh(); },
    onError,
  });
  const grantMutation = useMutation({
    mutationFn: ({ userId, role }: any) => organizationsApi.grantRole(selected.id, userId, role),
    onSuccess: () => { success(t('orgTeam.toast.roleGranted')); refresh(); },
    onError,
  });
  const revokeMutation = useMutation({
    mutationFn: ({ userId, role }: any) => organizationsApi.revokeRole(selected.id, userId, role),
    onSuccess: () => { success(t('orgTeam.toast.roleRevoked')); refresh(); },
    onError,
  });
  const removeMutation = useMutation({
    mutationFn: (userId: number) => organizationsApi.removeMember(selected.id, userId),
    onSuccess: () => { success(t('organizations.toast.memberRemoved')); refresh(); },
    onError,
  });
  const statusMutation = useMutation({
    mutationFn: (status: string) => organizationsApi.update(selected.id, { status }),
    onSuccess: (updated: any) => {
      success(updated.status === 'active' ? t('organizations.toast.orgActivated') : t('organizations.toast.orgSuspended'));
      setSelected(updated);
      refresh();
    },
    onError,
  });


  // client-side mirror of the server rules — problems shown before submitting
  const inviteProblems: string[] = [];
  if (invite.email && !/^\S+@\S+\.\S+$/.test(invite.email))
    inviteProblems.push(t('orgTeam.emailInvalid'));
  if (
    invite.password &&
    !(invite.password.length >= 8 && /[a-z]/.test(invite.password) && /[A-Z]/.test(invite.password) && /\d/.test(invite.password) && /[^A-Za-z0-9]/.test(invite.password))
  )
    inviteProblems.push(t('orgTeam.passwordHint'));
  const inviteReady =
    Boolean(invite.email.trim() && invite.firstName.trim() && invite.lastName.trim()) && inviteProblems.length === 0;

  const organizations = data?.data || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary-600" />
          <h1 className="text-lg font-semibold">{t('organizations.title')}</h1>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary btn-md gap-2">
          <Plus className="w-4 h-4" /> {t('organizations.newOrganization')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">{t('organizations.colName')}</th>
              <th className="table-header">{t('organizations.colType')}</th>
              <th className="table-header">{t('organizations.colStatus')}</th>
              <th className="table-header">{t('organizations.colMembers')}</th>
              <th className="table-header">{t('organizations.colProjects')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {organizations.map((org: any) => (
              <tr key={org.id} onClick={() => setSelected(org)} className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <td className="table-cell font-medium">{org.name}</td>
                <td className="table-cell">{t(`organizations.types.${org.type}`) || org.type}</td>
                <td className="table-cell"><span className={cn('badge', STATUS_BADGE[org.status] ?? 'bg-gray-100 text-gray-500')}>{t(`organizations.statuses.${org.status}`) || org.status}</span></td>
                <td className="table-cell">{org._count?.memberships ?? 0}</td>
                <td className="table-cell">{org._count?.ownedProjects ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setCreateOpen(false)}>
          <div className="card p-6 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold">{t('organizations.newOrganization')}</h2>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {['ngo', 'board', 'municipality', 'youth_team', 'initiative'].map((ty) => <option key={ty} value={ty}>{t(`organizations.types.${ty}`)}</option>)}
            </select>
            <input className="input" placeholder={t('organizations.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder={t('organizations.regNumberPlaceholder')} value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
            <button className="btn-primary btn-md w-full" disabled={!form.name} onClick={() => createMutation.mutate()}>{t('common.create')}</button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
          <div className="w-full max-w-xl h-full bg-white dark:bg-gray-900 shadow-xl overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2"><Building2 className="w-4 h-4" /> {selected.name}</h2>
              <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>

            {/* Status lifecycle (W2-E6: manual activation; self-service verification lands in Wave 6) */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase">{t('common.status')}</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('badge', STATUS_BADGE[selected.status] ?? 'bg-gray-100 text-gray-500')}>{t(`organizations.statuses.${selected.status}`) || selected.status}</span>
                {selected.verifiedAt && (
                  <span className="text-xs text-gray-400">{t('organizations.verifiedOn', { date: formatDate(selected.verifiedAt, locale) })}</span>
                )}
                {selected.status !== 'active' && selected.status !== 'archived' && (
                  <button
                    className="btn-primary btn-sm gap-1"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate('active')}
                  >
                    <CheckCircle2 className="w-3 h-3" /> {t('organizations.activate')}
                  </button>
                )}
                {selected.status === 'active' && (
                  <button
                    className="btn-secondary btn-sm gap-1"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate('suspended')}
                  >
                    <PauseCircle className="w-3 h-3" /> {t('organizations.suspend')}
                  </button>
                )}
              </div>
            </div>

            {/* Workspace entry: platform admins enter any org workspace via
                the audited switch-context (Board read-everywhere principle) */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase">{t('organizations.workspaceLabel')}</div>
              <div className="flex items-center gap-2">
                <button className="btn-primary btn-sm gap-1" onClick={() => switchOrg(selected.id, '/org/dashboard')}>
                  <ArrowRightCircle className="w-3 h-3" /> {t('organizations.openWorkspace')}
                </button>
                {activeOrgId === selected.id && <span className="badge bg-primary-100 text-primary-800">{t('organizations.currentContext')}</span>}
                {!contexts.some((c) => c.id === selected.id) && (
                  <span className="text-xs text-gray-400">{t('organizations.boardAccessNote')}</span>
                )}
              </div>
            </div>

            {/* Capability view (read-only) */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> {t('organizations.capabilitiesLabel')}</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(selected.capabilities || {}).map(([key, on]) => (
                  <span key={key} className={cn('badge', on ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500')}>{t(`organizations.capabilities.${key}`) || key}</span>
                ))}
              </div>
            </div>

            {/* Invite / create workspace member */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase">{t('organizations.addMemberLabel')}</div>
              <div className="grid grid-cols-3 gap-2">
                <input className="input" placeholder={t('orgTeam.emailPlaceholder')} value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
                <input className="input" placeholder={t('orgTeam.firstNamePlaceholder')} value={invite.firstName} onChange={(e) => setInvite({ ...invite, firstName: e.target.value })} />
                <input className="input" placeholder={t('orgTeam.lastNamePlaceholder')} value={invite.lastName} onChange={(e) => setInvite({ ...invite, lastName: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select className="input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} title={t('orgTeam.workspaceRoleTitle')}>
                  {ORG_ROLES.map((r) => <option key={r} value={r}>{t(`orgTeam.roles.${r}`)}</option>)}
                </select>
                <input
                  className="input col-span-2"
                  type="password"
                  placeholder={t('orgTeam.passwordPlaceholder')}
                  value={invite.password}
                  onChange={(e) => setInvite({ ...invite, password: e.target.value })}
                />
              </div>
              <button
                className="btn-secondary btn-sm gap-1"
                disabled={!inviteReady || inviteMutation.isPending}
                onClick={() => inviteMutation.mutate()}
              >
                <UserPlus className="w-3 h-3" /> {invite.password ? t('orgTeam.createMember') : t('orgTeam.sendInvite')}
              </button>
              {inviteProblems.map((msg) => (
                <p key={msg} className="text-xs text-red-600">{msg}</p>
              ))}
              <p className="text-xs text-gray-400">
                {t('organizations.requirementsNote')}
              </p>
              {createdLogin && !activationUrl && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-800">
                  <span className="font-medium">{t('orgTeam.memberCreated')}</span> {t('organizations.canLoginNow')} <code>{createdLogin}</code> {t('orgTeam.canLoginSuffix')}
                </div>
              )}
              {activationUrl && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs space-y-1">
                  <p className="font-medium text-emerald-800">{t('orgTeam.devActivationLink')}</p>
                  <div className="flex items-center gap-1">
                    <code className="flex-1 truncate text-emerald-700">{activationUrl}</code>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${activationUrl}`); success(t('orgTeam.toast.linkCopied')); }}
                    >
                      {t('orgTeam.copy')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Members */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase">{t('organizations.membersLabel')}</div>
              <div className="flex gap-2">
                <input className="input" placeholder={t('organizations.userIdPlaceholder')} value={memberId} onChange={(e) => setMemberId(e.target.value)} />
                <button className="btn-secondary btn-sm" disabled={!memberId} onClick={() => addMemberMutation.mutate()}>{t('organizations.add')}</button>
              </div>
              {(members || []).map((m: any) => (
                <div key={m.id} className="border border-gray-100 dark:border-gray-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">{m.user?.email ?? `user #${m.userId}`} <span className="text-gray-400">({m.user?.referenceType})</span></div>
                    <button className="btn-ghost btn-sm text-red-500" onClick={() => removeMutation.mutate(m.userId)}><Trash2 className="w-3 h-3" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {(m.roles || []).map((role: string) => (
                      <span key={role} className="badge bg-primary-100 text-primary-800 gap-1">
                        {t(`orgTeam.roles.${role}`) || role}
                        <button onClick={() => revokeMutation.mutate({ userId: m.userId, role })}>×</button>
                      </span>
                    ))}
                    <select
                      className="text-xs border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 bg-white dark:bg-gray-800"
                      value={roleByUser[m.userId] ?? ''}
                      onChange={(e) => setRoleByUser({ ...roleByUser, [m.userId]: e.target.value })}
                    >
                      <option value="">{t('orgTeam.addRolePlaceholder')}</option>
                      {ORG_ROLES.filter((r) => !(m.roles || []).includes(r)).map((r) => <option key={r} value={r}>{t(`orgTeam.roles.${r}`)}</option>)}
                    </select>
                    {roleByUser[m.userId] && (
                      <button className="btn-secondary btn-sm" onClick={() => { grantMutation.mutate({ userId: m.userId, role: roleByUser[m.userId] }); setRoleByUser({ ...roleByUser, [m.userId]: '' }); }}>{t('orgTeam.grant')}</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
