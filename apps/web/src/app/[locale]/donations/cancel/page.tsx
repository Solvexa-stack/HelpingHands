'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { XCircle } from 'lucide-react';

export default function PaymentCancelPage() {
  const t = useTranslations('payment.cancel');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card p-8 max-w-md w-full text-center space-y-5">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <XCircle className="w-8 h-8 text-red-500" />
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">{t('title')}</h1>
          <p className="text-gray-500 mt-1 text-sm">{t('message')}</p>
        </div>

        <div className="flex gap-3 justify-center pt-2">
          {projectId ? (
            <Link
              href={`/${locale}/projects/${projectId}`}
              className="btn-primary text-sm py-2 px-5"
            >
              {t('tryAgain')} →
            </Link>
          ) : (
            <Link href={`/${locale}/projects`} className="btn-primary text-sm py-2 px-5">
              {t('tryAgain')} →
            </Link>
          )}
          {projectId && (
            <Link href={`/${locale}/projects`} className="btn-secondary text-sm py-2 px-5">
              {t('backToProject')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
