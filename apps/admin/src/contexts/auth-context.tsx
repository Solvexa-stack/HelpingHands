'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi, organizationsApi } from '@/lib/api';

export interface AdminUser {
  id: number;
  email: string;
  role: string;
  referenceType: string;
  referenceId: number;
  admin?: { firstName: string; lastName: string; role: string };
  isActive: boolean;
}

export interface OrgContext {
  id: number;
  name: string;
  type: string;
  status: string;
  /** Org-scoped RBAC roles the user holds here (e.g. org_admin, staff). */
  roles?: string[];
}

/**
 * W3 UI isolation: the three workspaces (07). `platform` = users holding
 * platform/Board grants (`hasBoardWorkspace`) — they keep the global admin
 * app (incl. /board). `organization` = tenant members — they get the
 * organization workspace at /org/* and platform pages never mount for them.
 */
export type WorkspaceType = 'platform' | 'organization';

interface AuthCtx {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // W2-E5: workspace contexts
  contexts: OrgContext[];
  hasBoardWorkspace: boolean;
  activeOrgId: number | null;
  switchOrg: (organizationId: number, redirectTo?: string) => Promise<void>;
  // W3 UI isolation
  workspaceType: WorkspaceType;
  activeOrg: OrgContext | null;
  /** The landing page of the user's workspace. */
  workspaceHome: string;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [contexts, setContexts] = useState<OrgContext[]>([]);
  const [hasBoardWorkspace, setHasBoardWorkspace] = useState(false);
  const [activeOrgId, setActiveOrgId] = useState<number | null>(null);
  // Board users may enter workspaces of orgs they are not members of
  // (audited switch-context) — this carries that org's identity.
  const [visitingOrg, setVisitingOrg] = useState<OrgContext | null>(null);

  const decodeActiveOrg = () => {
    try {
      const token = localStorage.getItem('admin_access_token');
      if (!token) return null;
      return JSON.parse(atob(token.split('.')[1])).activeOrgId ?? null;
    } catch {
      return null;
    }
  };

  const loadContexts = useCallback(async () => {
    try {
      const data = await authApi.getContexts();
      const orgs: OrgContext[] = data.organizations ?? [];
      const aid = decodeActiveOrg();
      setContexts(orgs);
      setHasBoardWorkspace(data.hasBoardWorkspace ?? false);
      setActiveOrgId(aid);
      if (aid != null && data.hasBoardWorkspace && !orgs.some((o) => o.id === aid)) {
        try {
          const org = await organizationsApi.get(aid);
          setVisitingOrg({ id: org.id, name: org.name, type: org.type, status: org.status });
        } catch {
          setVisitingOrg(null);
        }
      } else {
        setVisitingOrg(null);
      }
    } catch {
      setContexts([]);
    }
  }, []);

  const loadUser = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_access_token') : null;
    if (!token) { setLoading(false); return; }
    try {
      const profile = await authApi.getMe();
      if (profile.referenceType !== 'admin') throw new Error('Not an admin');
      setUser(profile);
      await loadContexts();
    } catch {
      setUser(null);
      localStorage.removeItem('admin_access_token');
      localStorage.removeItem('admin_refresh_token');
    } finally {
      setLoading(false);
    }
  }, [loadContexts]);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (email: string, password: string) => {
    const data = await authApi.login({ email, password });
    if (data.user.referenceType !== 'admin') throw new Error('Access denied. Admin accounts only.');
    localStorage.setItem('admin_access_token', data.accessToken);
    localStorage.setItem('admin_refresh_token', data.refreshToken);
    setUser(data.user);
    await loadContexts();
  };

  // W2-E5: switching = new JWT scoped to the chosen org, then reload data
  const switchOrg = async (organizationId: number, redirectTo?: string) => {
    const tokens = await authApi.switchContext(organizationId);
    localStorage.setItem('admin_access_token', tokens.accessToken);
    localStorage.setItem('admin_refresh_token', tokens.refreshToken);
    setActiveOrgId(organizationId);
    if (redirectTo) window.location.assign(redirectTo);
    else window.location.reload();
  };

  const logout = async () => {
    await authApi.logout();
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_refresh_token');
    setUser(null);
  };

  const workspaceType: WorkspaceType = hasBoardWorkspace ? 'platform' : 'organization';
  const activeOrg =
    contexts.find((c) => c.id === activeOrgId) ?? visitingOrg ?? (contexts.length === 1 ? contexts[0] : null);
  const workspaceHome = workspaceType === 'organization' ? '/org/dashboard' : '/dashboard';

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, contexts, hasBoardWorkspace, activeOrgId, switchOrg, workspaceType, activeOrg, workspaceHome }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
