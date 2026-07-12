'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { OrgSidebar } from '@/components/layout/org-sidebar';
import { OrgHeader } from '@/components/layout/org-header';
import { platformPathFor } from '@/lib/workspace';

/**
 * W3 UI isolation — the Organization Workspace shell. Its own navigation,
 * header and dashboard: a separate application sharing the backend. Platform
 * users are bounced to their own workspace before anything here mounts.
 */
export default function OrgWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, workspaceType, activeOrg } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    // Platform users are allowed in: the Board enters any org workspace via
    // the audited switch-context. Only redirect when there is no org context
    // at all to render.
    else if (workspaceType === 'platform' && !activeOrg) router.replace(platformPathFor(pathname));
  }, [user, loading, workspaceType, activeOrg, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // No user / no org context: render nothing while the redirect happens.
  if (!user || (workspaceType === 'platform' && !activeOrg)) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <OrgSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <OrgHeader />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
