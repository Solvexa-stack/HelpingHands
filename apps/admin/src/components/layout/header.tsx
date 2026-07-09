'use client';

import { useRouter, usePathname } from 'next/navigation';
import { LogOut, ExternalLink, Sun, Moon, Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useLanguage, type Locale } from '@/contexts/language-context';
import { NotificationBell } from './notification-bell';

const pageTitleKeys: Record<string, string> = {
  '/dashboard': 'nav.dashboard',
  '/donations': 'nav.donations',
  '/projects': 'nav.projects',
  '/participants': 'nav.participants',
  '/employees': 'nav.employees',
  '/content/blogs': 'nav.blogs',
  '/content/news': 'nav.news',
  '/content/events': 'nav.events',
  '/content/about': 'nav.about',
  '/languages': 'nav.languages',
  '/studies': 'nav.studies',
  '/organizations': 'nav.organizations',
  '/board': 'nav.board',
};

function WorkspaceSwitcher() {
  const { contexts, activeOrgId, switchOrg } = useAuth();
  if (contexts.length === 0) return null; // no org memberships → nothing to show

  // Single membership: auto-context (zero-change UX) — show it, don't offer a picker
  if (contexts.length === 1) {
    return (
      <span
        className="flex items-center gap-1.5 text-xs border border-primary-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-primary-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
        title="Active workspace"
      >
        <Building2 className="w-3.5 h-3.5 text-primary-600" />
        {contexts[0].name}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5" title="Active workspace">
      <Building2 className="w-3.5 h-3.5 text-primary-600" />
      <select
        value={activeOrgId ?? ''}
        onChange={(e) => switchOrg(Number(e.target.value))}
        className="text-xs border border-primary-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {activeOrgId === null && <option value="">Select workspace…</option>}
        {contexts.map((org) => (
          <option key={org.id} value={org.id}>{org.name}</option>
        ))}
      </select>
    </div>
  );
}

export function Header() {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { locale, setLocale, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  const titleKey = Object.entries(pageTitleKeys).find(([key]) => pathname.startsWith(key))?.[1] || '';
  const title = titleKey ? t(titleKey) : t('header.adminTitle');

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</h1>

      <div className="flex items-center gap-2">
        {/* W2-E5: workspace context switcher (hidden for single-workspace users) */}
        <WorkspaceSwitcher />

        {/* Language switcher */}
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="en">EN</option>
          <option value="ar">AR</option>
          <option value="fr">FR</option>
        </select>

        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          className="btn-ghost btn-sm text-gray-500"
          title={theme === 'dark' ? t('header.switchToLight') : t('header.switchToDark')}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notification bell */}
        <NotificationBell />

        <a
          href={process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost btn-sm text-gray-500"
        >
          <ExternalLink className="w-4 h-4" />
          <span className="hidden sm:inline">{t('header.viewSite')}</span>
        </a>

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
