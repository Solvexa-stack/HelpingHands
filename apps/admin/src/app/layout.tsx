import type { Metadata } from 'next';
import { Inter, Cairo } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const cairo = Cairo({ subsets: ['arabic'], variable: '--font-cairo' });

export const metadata: Metadata = {
  title: { default: 'Admin — HelpingHands', template: '%s | Admin' },
  description: 'HelpingHands Admin Dashboard',
};

// Admin's locale is a client-side toggle (localStorage), not a URL segment,
// so it isn't known at SSR time. This inline script runs before hydration to
// set lang/dir/font from the stored preference and avoid a flash of the
// wrong direction/font on load — the same technique commonly used to avoid
// dark-mode flash.
const LOCALE_INIT_SCRIPT = `
(function () {
  try {
    var locale = localStorage.getItem('admin-locale');
    var html = document.documentElement;
    if (locale === 'ar') {
      html.setAttribute('lang', 'ar');
      html.setAttribute('dir', 'rtl');
      html.classList.add('font-arabic');
    } else if (locale === 'en' || locale === 'fr') {
      html.setAttribute('lang', locale);
      html.setAttribute('dir', 'ltr');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${inter.variable} ${cairo.variable} font-sans`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
