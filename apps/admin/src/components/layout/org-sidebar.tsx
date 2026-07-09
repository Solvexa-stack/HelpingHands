'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, Heart, FlaskConical, Users, Settings,
  ChevronRight, Building2,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';
import { cn } from '@/lib/utils';

/**
 * W3 UI isolation — the Organization Workspace navigation. This is the whole
 * menu: no platform administration, no CMS, no Board, no cross-org anything.
 * Platform pages live in a different layout and never mount for org users.
 */
const navItems = [
  { href: '/org/dashboard', icon: LayoutDashboard, tKey: 'nav.dashboard' },
  { href: '/org/projects', icon: FolderKanban, tKey: 'nav.projects' },
  { href: '/org/studies', icon: FlaskConical, tKey: 'nav.studies' },
  { href: '/org/donations', icon: Heart, tKey: 'nav.donations' },
  { href: '/org/team', icon: Users, tKey: 'nav.team' },
  { href: '/org/settings', icon: Settings, tKey: 'nav.settings' },
];

export function OrgSidebar() {
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const { t } = useLanguage();

  const label = (tKey: string) => {
    const v = t(tKey);
    // fall back to a readable label while translations catch up
    return v && v !== tKey ? v : tKey.replace('nav.', '').replace(/^./, (c) => c.toUpperCase());
  };

  return (
    <aside className="w-64 bg-sidebar flex flex-col h-full">
      {/* Workspace identity */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm truncate" title={activeOrg?.name}>
              {activeOrg?.name ?? '…'}
            </p>
            <p className="text-emerald-400 text-xs">Organization workspace</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || (item.href !== '/org/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                isActive
                  ? 'bg-emerald-600 text-white'
                  : 'text-blue-200 hover:bg-sidebar-hover hover:text-white',
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label(item.tKey)}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      {user && (
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-700 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user.admin?.firstName?.[0]}{user.admin?.lastName?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {user.admin?.firstName} {user.admin?.lastName}
              </p>
              <p className="text-emerald-400 text-xs">Member</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
