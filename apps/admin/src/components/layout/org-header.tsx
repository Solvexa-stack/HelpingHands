'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Sun, Moon, Building2, Undo2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useLanguage, type Locale } from '@/contexts/language-context';
import { NotificationBell } from './notification-bell';

const pageTitleKeys: Record<string, string> = {
  '/org/dashboard': 'nav.dashboard',
  '/org/projects': 'nav.projects',
  '/org/studies': 'nav.studies',
  '/org/donations': 'nav.donations',
  '/org/team': 'nav.team',
  '/org/settings': 'nav.settings',
};

/**
 * W3 UI isolation — the Organization Workspace header: workspace identity,
 * org switcher (multi-org members only), no platform links.
 */
export function OrgHeader() {
  const { logout, contexts, activeOrgId, activeOrg, switchOrg, workspaceType } = useAuth();
  const { theme, toggle } = useTheme();
  const { locale, setLocale, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  const titleKey = Object.entries(pageTitleKeys).find(([key]) => pathname.startsWith(key))?.[1];
  const title = titleKey ? t(titleKey) : activeOrg?.name ?? '';

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</h1>
        {/* Always-visible workspace identity — clicking it goes home */}
        <Link
          href="/org/dashboard"
          className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-2 py-1 truncate hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
          title={t('orgHeader.workspaceHome')}
        >
          <Building2 className="w-3.5 h-3.5" />
          {activeOrg?.name}
        </Link>
      </div>

      <div className="flex items-center gap-2">
        {/* Platform users visiting an org workspace can step back out */}
        {workspaceType === 'platform' && (
          <Link href="/dashboard" className="btn-ghost btn-sm text-gray-500 gap-1" title={t('orgHeader.backToPlatform')}>
            <Undo2 className="w-4 h-4" />
            <span className="hidden sm:inline">{t('orgHeader.platform')}</span>
          </Link>
        )}
        {/* Multi-org members can switch workspaces; single-org members are auto-scoped */}
        {contexts.length > 1 && (
          <select
            value={activeOrgId ?? ''}
            onChange={(e) => switchOrg(Number(e.target.value))}
            className="text-xs border border-emerald-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            title={t('orgHeader.switchOrganization')}
          >
            {contexts.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        )}

        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="en">EN</option>
          <option value="ar">AR</option>
          <option value="fr">FR</option>
        </select>

        <button
          onClick={toggle}
          className="btn-ghost btn-sm text-gray-500"
          title={theme === 'dark' ? t('header.switchToLight') : t('header.switchToDark')}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <NotificationBell linkBase="/org" />

        <button
          onClick={handleLogout}
          className="btn-ghost btn-sm text-gray-500 hover:text-red-600 hover:bg-red-50"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">{t('header.logout')}</span>
        </button>
      </div>
    </header>
  );
}
