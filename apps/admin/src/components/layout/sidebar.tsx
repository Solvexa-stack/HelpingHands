'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, Heart, Users, UserCheck,
  FileText, Newspaper, CalendarDays, Info, Globe, Heart as HeartIcon,
  ChevronRight, FlaskConical, BarChart3, ScrollText, Building2, Landmark, GitBranch, Banknote,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';
import { cn } from '@/lib/utils';

// `platformOnly` marks platform-administration pages: they need a platform
// (Board) grant on top of the legacy role — org workspaces never see them.
const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, tKey: 'nav.dashboard', roles: ['administrator', 'employee', 'financial_officer'] },
  { href: '/donations', icon: Heart, tKey: 'nav.donations', roles: ['administrator', 'employee', 'financial_officer'] },
  { href: '/projects', icon: FolderKanban, tKey: 'nav.projects', roles: ['administrator', 'employee', 'financial_officer'] },
  { href: '/studies', icon: FlaskConical, tKey: 'nav.studies', roles: ['administrator', 'employee', 'financial_officer'] },
  { href: '/participants', icon: Users, tKey: 'nav.participants', roles: ['administrator', 'employee'] },
  { href: '/employees', icon: UserCheck, tKey: 'nav.employees', roles: ['administrator'], platformOnly: true },
  { label: 'separator' },
  { href: '/content/blogs', icon: FileText, tKey: 'nav.blogs', roles: ['administrator', 'employee'] },
  { href: '/content/news', icon: Newspaper, tKey: 'nav.news', roles: ['administrator', 'employee'] },
  { href: '/content/events', icon: CalendarDays, tKey: 'nav.events', roles: ['administrator', 'employee'] },
  { href: '/content/about', icon: Info, tKey: 'nav.about', roles: ['administrator', 'employee'] },
  { label: 'separator' },
  { href: '/languages', icon: Globe, tKey: 'nav.languages', roles: ['administrator'], platformOnly: true },
  { href: '/reports', icon: BarChart3, tKey: 'nav.reports', roles: ['administrator', 'financial_officer'] },
  { href: '/audit', icon: ScrollText, tKey: 'nav.audit', roles: ['administrator'], platformOnly: true },
  { href: '/organizations', icon: Building2, tKey: 'nav.organizations', roles: ['administrator'], platformOnly: true },
  { href: '/workflow', icon: GitBranch, tKey: 'nav.workflow', roles: ['administrator'], platformOnly: true },
  { href: '/funds', icon: Banknote, tKey: 'nav.funds', roles: ['administrator'], platformOnly: true },
  { href: '/board', icon: Landmark, tKey: 'nav.board', roles: ['administrator'], boardOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, hasBoardWorkspace, contexts, activeOrgId } = useAuth();
  const { t } = useLanguage();
  const role = user?.admin?.role || '';
  const activeOrg = contexts.find((c) => c.id === activeOrgId) ?? (contexts.length === 1 ? contexts[0] : null);

  const visible = navItems.filter((item: any) => {
    if (item.label === 'separator') return true;
    if (item.boardOnly && !hasBoardWorkspace) return false;
    if (item.platformOnly && !hasBoardWorkspace) return false;
    return item.roles?.includes(role);
  });

  const label = (item: any) => item.tKey ? t(item.tKey) : (item.label || '');

  return (
    <aside className="w-64 bg-sidebar flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <HeartIcon className="w-4 h-4 text-white fill-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm">HelpingHands</p>
            <p className="text-blue-400 text-xs">{t('sidebar.adminPanel')}</p>
            {/* W2 isolation: unambiguous workspace identity */}
            {activeOrg && (
              <p className="text-blue-300 text-xs truncate mt-0.5" title={activeOrg.name}>
                <Building2 className="w-3 h-3 inline mr-1 align-[-1px]" />
                {activeOrg.name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {visible.map((item, i) => {
          if (item.label === 'separator') {
            return <div key={i} className="my-2 border-t border-white/10" />;
          }

          const Icon = item.icon!;
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href!));

          return (
            <Link
              key={item.href}
              href={item.href!}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-blue-200 hover:bg-sidebar-hover hover:text-white',
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label(item)}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      {user && (
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary-700 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user.admin?.firstName?.[0]}{user.admin?.lastName?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {user.admin?.firstName} {user.admin?.lastName}
              </p>
              <p className="text-blue-400 text-xs">{t(`roles.${role}`) || role.replace('_', ' ')}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
