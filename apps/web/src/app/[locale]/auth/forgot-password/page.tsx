'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Heart } from 'lucide-react';
import { authApi } from '@/lib/api';

const schema = z.object({
  email: z.string().email('Invalid email address'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [serverError, setServerError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      await authApi.forgotPassword(data.email);
      setSubmitted(true);
    } catch (err: any) {
      setServerError(err?.response?.data?.message || 'Something went wrong');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <Heart className="w-8 h-8 text-primary-600 fill-primary-600" />
              <span className="text-2xl font-extrabold text-brand">HelpingHands</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('forgotPassword')}</h1>
            <p className="text-gray-500 mt-1 text-sm">{t('forgotPasswordSubtitle')}</p>
          </div>

          {submitted ? (
            <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">
              {t('forgotPasswordSent')}
            </div>
          ) : (
            <>
              {serverError && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-6">
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label className="label">{t('email')}</label>
                  <input
                    {...register('email')}
                    type="email"
                    className="input"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>

                <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
                  {isSubmitting ? (
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : t('sendResetLink')}
                </button>
              </form>
            </>
          )}

          <p className="text-center text-sm text-gray-500 mt-6">
            <Link href={`/${locale}/auth/login`} className="text-primary-600 font-semibold hover:underline">
              {t('backToLogin')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
