'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { orgPathFor } from '@/lib/workspace';

/**
 * Platform Workspace shell (global administration + Board). W3 UI isolation:
 * organization members are redirected to their own workspace (/org/*) before
 * any platform page mounts.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, workspaceType } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (workspaceType === 'organization') router.replace(orgPathFor(pathname));
  }, [user, loading, workspaceType, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Wrong workspace: platform pages never mount for organization members.
  if (!user || workspaceType === 'organization') return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
