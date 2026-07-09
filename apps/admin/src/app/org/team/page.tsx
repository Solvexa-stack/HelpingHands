'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus } from 'lucide-react';
import { organizationsApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/ui/toaster';

const ORG_ROLES = ['org_admin', 'project_manager', 'staff', 'org_accountant', 'viewer'];

/**
 * W3 UI isolation — the organization's own team. The backend only answers for
 * the caller's own organization (org_admin grant), so no cross-org people are
 * reachable here — platform employees are not part of this list.
 */
export default function OrgTeamPage() {
  const { activeOrgId } = useAuth();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [invite, setInvite] = useState({ email: '', firstName: '', lastName: '', password: '', role: 'staff' });
  const [activationUrl, setActivationUrl] = useState<string | null>(null);
  const [createdLogin, setCreatedLogin] = useState<string | null>(null);
  const [roleByUser, setRoleByUser] = useState<Record<number, string>>({});

  const { data: members, error } = useQuery({
    queryKey: ['org-team', activeOrgId],
    queryFn: () => organizationsApi.members(activeOrgId!),
    enabled: activeOrgId != null,
    retry: false,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['org-team'] });
  const onError = (err: any) => {
    const data = err?.response?.data;
    const details = Array.isArray(data?.errors) ? `: ${data.errors.join('; ')}` : '';
    toastError(`${data?.message || 'Failed'}${details}`);
  };

  const inviteMutation = useMutation({
    mutationFn: () =>
      organizationsApi.inviteFirstAdmin(activeOrgId!, {
        email: invite.email.trim(),
        firstName: invite.firstName.trim(),
        lastName: invite.lastName.trim(),
        role: invite.role,
        ...(invite.password ? { password: invite.password } : {}),
      }),
    onSuccess: (data: any) => {
      success(data?.message ?? 'Invitation sent');
      setCreatedLogin(invite.password ? invite.email : null); // direct-credentials mode
      setActivationUrl(data?.activationUrl ?? null); // dev-only field (link mode)
      setInvite({ email: '', firstName: '', lastName: '', password: '', role: 'staff' });
      refresh();
    },
    onError,
  });
  const grantMutation = useMutation({
    mutationFn: ({ userId, role }: any) => organizationsApi.grantRole(activeOrgId!, userId, role),
    onSuccess: () => { success('Role granted'); refresh(); },
    onError,
  });
  const revokeMutation = useMutation({
    mutationFn: ({ userId, role }: any) => organizationsApi.revokeRole(activeOrgId!, userId, role),
    onSuccess: () => { success('Role revoked'); refresh(); },
    onError,
  });


  // client-side mirror of the server rules — problems shown before submitting
  const inviteProblems: string[] = [];
  if (invite.email && !/^\S+@\S+\.\S+$/.test(invite.email))
    inviteProblems.push('Email must be a full address like name@domain.com');
  if (
    invite.password &&
    !(invite.password.length >= 8 && /[a-z]/.test(invite.password) && /[A-Z]/.test(invite.password) && /\d/.test(invite.password) && /[^A-Za-z0-9]/.test(invite.password))
  )
    inviteProblems.push('Password needs 8+ characters incl. uppercase, lowercase, a number and a special character');
  const inviteReady =
    Boolean(invite.email.trim() && invite.firstName.trim() && invite.lastName.trim()) && inviteProblems.length === 0;

  const restricted = (error as any)?.response?.status === 403;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-emerald-600" />
        <h1 className="text-lg font-semibold">Team</h1>
        <span className="text-sm text-gray-400">members of your organization</span>
      </div>

      {restricted && (
        <div className="card p-6 text-center text-gray-500 text-sm">
          Team management is available to organization admins.
        </div>
      )}

      {!restricted && (
        <>
          {/* Invite */}
          <div className="card p-5 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase">Invite a member</div>
            <div className="grid sm:grid-cols-3 gap-2">
              <input className="input" placeholder="Email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
              <input className="input" placeholder="First name" value={invite.firstName} onChange={(e) => setInvite({ ...invite, firstName: e.target.value })} />
              <input className="input" placeholder="Last name" value={invite.lastName} onChange={(e) => setInvite({ ...invite, lastName: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <select className="input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} title="Workspace role">
                {ORG_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <input
                className="input"
                type="password"
                placeholder="Password (optional — sets login now)"
                value={invite.password}
                onChange={(e) => setInvite({ ...invite, password: e.target.value })}
              />
              <button
                className="btn-primary btn-md gap-1"
                disabled={!inviteReady || inviteMutation.isPending}
                onClick={() => inviteMutation.mutate()}
              >
                <UserPlus className="w-4 h-4" /> {invite.password ? 'Create member' : 'Send invite'}
              </button>
            </div>
            {inviteProblems.map((msg) => (
              <p key={msg} className="text-xs text-red-600">{msg}</p>
            ))}
            <p className="text-xs text-gray-400">
              Email, first and last name are required. With a password (min 8, uppercase + lowercase + number + special, e.g. <code>Member@123</code>) the member can log in immediately; without one they receive an activation link to choose their own.
            </p>
            {createdLogin && !activationUrl && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-800">
                <span className="font-medium">Member created.</span> They can log in right now at <code>/login</code> with <code>{createdLogin}</code> and the password you set.
              </div>
            )}
            {activationUrl && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs space-y-1">
                <p className="font-medium text-emerald-800">Dev activation link (no SMTP configured):</p>
                <div className="flex items-center gap-1">
                  <code className="flex-1 truncate text-emerald-700">{activationUrl}</code>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${activationUrl}`); success('Link copied'); }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Members */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Member</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Roles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(members ?? []).map((m: any) => (
                  <tr key={m.id}>
                    <td className="table-cell font-medium">{m.user?.email ?? `user #${m.userId}`}</td>
                    <td className="table-cell">
                      <span className={m.status === 'active' ? 'badge bg-green-100 text-green-800' : 'badge bg-red-100 text-red-700'}>{m.status}</span>
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-wrap items-center gap-1">
                        {(m.roles || []).map((role: string) => (
                          <span key={role} className="badge bg-emerald-100 text-emerald-800 gap-1">
                            {role}
                            <button onClick={() => revokeMutation.mutate({ userId: m.userId, role })}>×</button>
                          </span>
                        ))}
                        <select
                          className="text-xs border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 bg-white dark:bg-gray-800"
                          value={roleByUser[m.userId] ?? ''}
                          onChange={(e) => setRoleByUser({ ...roleByUser, [m.userId]: e.target.value })}
                        >
                          <option value="">+ role…</option>
                          {ORG_ROLES.filter((r) => !(m.roles || []).includes(r)).map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {roleByUser[m.userId] && (
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => { grantMutation.mutate({ userId: m.userId, role: roleByUser[m.userId] }); setRoleByUser({ ...roleByUser, [m.userId]: '' }); }}
                          >
                            Grant
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(members ?? []).length === 0 && (
                  <tr><td colSpan={3} className="p-8 text-center text-gray-400">No members yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
