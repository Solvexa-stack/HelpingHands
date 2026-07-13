import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Heart, Mail, Phone, MapPin } from 'lucide-react';

export function Footer() {
  const t = useTranslations('nav');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand text-white">
      <div className="container py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="w-6 h-6 text-primary-400 fill-primary-400" />
              <span className="text-xl font-bold">HelpingHands</span>
            </div>
            <p className="text-blue-200 text-sm leading-relaxed">
              Connecting generous donors with impactful projects worldwide. Every contribution makes a difference.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4 text-white">Quick Links</h3>
            <ul className="space-y-2">
              {['projects', 'news', 'blogs', 'events'].map((key) => (
                <li key={key}>
                  <Link href={`/${key}`} className="text-blue-200 hover:text-white text-sm transition-colors capitalize">
                    {t(key as any)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* About */}
          <div>
            <h3 className="font-semibold mb-4 text-white">Organization</h3>
            <ul className="space-y-2">
              <li><Link href="/about" className="text-blue-200 hover:text-white text-sm transition-colors">{t('about')}</Link></li>
              <li><Link href="/contact" className="text-blue-200 hover:text-white text-sm transition-colors">{t('contact')}</Link></li>
              <li><Link href="/auth/login" className="text-blue-200 hover:text-white text-sm transition-colors">{t('login')}</Link></li>
              <li><Link href="/auth/register" className="text-blue-200 hover:text-white text-sm transition-colors">{t('register')}</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4 text-white">Contact</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-blue-200 text-sm">
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span>info@helpinghands.org</span>
              </li>
              <li className="flex items-center gap-2 text-blue-200 text-sm">
                <Phone className="w-4 h-4 flex-shrink-0" />
                <span>+1 (555) 000-0000</span>
              </li>
              <li className="flex items-start gap-2 text-blue-200 text-sm">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>123 Charity Lane, Hope City</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-blue-800">
        <div className="container py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-blue-300 text-sm">
            © {year} HelpingHands. All rights reserved. 
          </p>
          <div className="flex gap-4">
            <Link href="/privacy" className="text-blue-300 hover:text-white text-sm transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-blue-300 hover:text-white text-sm transition-colors">Terms of Service</Link>
            <Link href="/terms" className="text-blue-300 hover:text-white text-sm transition-colors">Created by : Tarek Zain Aldin Feras Masoud</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
