'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Menu, X, ChevronDown, Heart, Globe } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/projects', label: 'projects' },
  { href: '/news', label: 'news' },
  { href: '/blogs', label: 'blogs' },
  { href: '/events', label: 'events' },
  { href: '/about', label: 'about' },
  { href: '/contact', label: 'contact' },
] as const;

const languages = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
];

export function Navbar() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const switchLocale = (newLocale: string) => {
    const segments = pathname.split('/');
    segments[1] = newLocale;
    router.push(segments.join('/') || `/${newLocale}`);
    setLangOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <nav className="container flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-brand">
          <Heart className="w-6 h-6 text-primary-600 fill-primary-600" />
          <span>HelpingHands</span>
        </Link>

        {/* Desktop nav */}
        <ul className="hidden lg:flex items-center gap-6">
          {navLinks.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={`/${locale}${href}`}
                className={cn(
                  'text-sm font-medium transition-colors hover:text-primary-600',
                  pathname.includes(href) ? 'text-primary-600' : 'text-gray-600',
                )}
              >
                {t(label)}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right side */}
        <div className="hidden lg:flex items-center gap-3">
          {/* Language switcher */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600 transition-colors px-2 py-1 rounded-lg hover:bg-gray-50"
            >
              <Globe className="w-4 h-4" />
              <span>{locale.toUpperCase()}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {langOpen && (
              <div className="absolute top-full mt-1 right-0 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[120px]">
                {languages.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => switchLocale(l.code)}
                    className={cn(
                      'w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors',
                      l.code === locale ? 'text-primary-600 font-medium' : 'text-gray-700',
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {user ? (
            <div className="relative group">
              <button className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-primary-600">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold text-xs">
                  {user.participant?.firstName?.[0] || user.admin?.firstName?.[0] || 'U'}
                </div>
                <ChevronDown className="w-3 h-3" />
              </button>
              <div className="absolute top-full mt-1 right-0 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[160px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <Link href={`/${locale}/dashboard`} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  {t('dashboard')}
                </Link>
                <hr className="my-1 border-gray-100" />
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  {t('logout')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <Link href={`/${locale}/auth/login`} className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors">
                {t('login')}
              </Link>
              <Link href={`/${locale}/auth/register`} className="btn-primary text-sm py-2 px-4">
                {t('register')}
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-50"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-1">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={`/${locale}${href}`}
              className="block py-2 text-gray-700 hover:text-primary-600 font-medium"
              onClick={() => setMobileOpen(false)}
            >
              {t(label)}
            </Link>
          ))}
          <hr className="border-gray-100 my-2" />
          {user ? (
            <>
              <Link href={`/${locale}/dashboard`} className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                {t('dashboard')}
              </Link>
              <button onClick={handleLogout} className="block py-2 text-red-600 font-medium">
                {t('logout')}
              </button>
            </>
          ) : (
            <>
              <Link href={`/${locale}/auth/login`} className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                {t('login')}
              </Link>
              <Link href={`/${locale}/auth/register`} className="block py-2 text-primary-600 font-semibold" onClick={() => setMobileOpen(false)}>
                {t('register')}
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
