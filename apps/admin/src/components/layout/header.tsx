'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Bell, LogOut, ExternalLink, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useLanguage, type Locale } from '@/contexts/language-context';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/donations': 'Donations',
  '/projects': 'Projects',
  '/participants': 'Participants',
  '/employees': 'Team Management',
  '/content/blogs': 'Blogs',
  '/content/news': 'News',
  '/content/events': 'Events',
  '/content/about': 'About Us',
  '/languages': 'Languages',
};

export function Header() {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { locale, setLocale } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  const title = Object.entries(pageTitles).find(([key]) => pathname.startsWith(key))?.[1] || 'Admin';

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</h1>

      <div className="flex items-center gap-2">
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
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <a
          href={process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost btn-sm text-gray-500"
        >
          <ExternalLink className="w-4 h-4" />
          <span className="hidden sm:inline">View Site</span>
        </a>

        <button
          onClick={handleLogout}
          className="btn-ghost btn-sm text-gray-500 hover:text-red-600 hover:bg-red-50"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
