'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, ShieldCheck } from 'lucide-react';
import { organizationsApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

/**
 * W3 UI isolation — organization settings: the org's own profile and
 * capability view. Nothing platform-related lives here; lifecycle (activate/
 * suspend) and capability switches remain Board verbs on the platform side.
 */
export default function OrgSettingsPage() {
  const { locale } = useLanguage();
  const { activeOrgId, activeOrg } = useAuth();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', registrationNumber: '' });

  const { data: org, error } = useQuery({
    queryKey: ['org-settings', activeOrgId],
    queryFn: () => organizationsApi.get(activeOrgId!),
    enabled: activeOrgId != null,
    retry: false,
  });

  useEffect(() => {
    if (org) setForm({ name: org.name ?? '', registrationNumber: org.registrationNumber ?? '' });
  }, [org]);

  const saveMutation = useMutation({
    mutationFn: () => organizationsApi.update(activeOrgId!, form),
    onSuccess: () => { success('Organization profile saved'); qc.invalidateQueries({ queryKey: ['org-settings'] }); },
    onError: (err: any) =>
      toastError(
        err?.response?.status === 403
          ? 'Profile changes are currently managed by the platform team (Wave 6 opens self-service).'
          : err?.response?.data?.message || 'Failed',
      ),
  });

  const restricted = (error as any)?.response?.status === 403;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-emerald-600" />
        <h1 className="text-lg font-semibold">Organization settings</h1>
      </div>

      {restricted && (
        <div className="card p-6 text-center text-gray-500 text-sm">
          Settings are available to organization admins.
        </div>
      )}

      {!restricted && org && (
        <>
          {/* Profile */}
          <div className="card p-5 space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase">Profile</div>
            <div>
              <label className="text-xs text-gray-500">Name</label>
              <input className="input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Registration number</label>
              <input className="input w-full" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
            </div>
            <div className="flex items-center gap-3">
              <button className="btn-primary btn-md" disabled={!form.name || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                Save
              </button>
              <span className="text-xs text-gray-400">
                Status: <span className={cn('badge', org.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800')}>{org.status}</span>
                {org.verifiedAt && <> · verified {new Date(org.verifiedAt).toLocaleDateString(locale)}</>}
              </span>
            </div>
          </div>

          {/* Capabilities (read-only — Board-controlled) */}
          <div className="card p-5 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Capabilities
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(org.capabilities ?? {}).map(([key, on]) => (
                <span key={key} className={cn('badge', on ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500')}>{key}</span>
              ))}
            </div>
            <p className="text-xs text-gray-400">Capabilities are granted by the platform Board.</p>
          </div>
        </>
      )}

      {!restricted && !org && activeOrg && (
        <div className="card p-6 text-center text-gray-400 text-sm">Loading {activeOrg.name}…</div>
      )}
    </div>
  );
}
