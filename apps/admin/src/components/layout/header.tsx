'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Bell, LogOut, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

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
  const router = useRouter();
  const pathname = usePathname();

  const title = Object.entries(pageTitles).find(([key]) => pathname.startsWith(key))?.[1] || 'Admin';

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-gray-800">{title}</h1>

      <div className="flex items-center gap-2">
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
