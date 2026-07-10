'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CreditCard, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { paymentsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface OnlineDonateButtonProps {
  projectId: number;
}

const PRESETS = [100, 250, 500, 1000, 2500, 5000];
const CURRENCIES = ['USD', 'EUR', 'GBP'];

export function OnlineDonateButton({ projectId }: OnlineDonateButtonProps) {
  const t = useTranslations('payment');
  const locale = useLocale();
  const { user } = useAuth();
  const router = useRouter();

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePay = async (provider: 'stripe' | 'paypal') => {
    if (!user) {
      router.push(`/${locale}/auth/login?redirect=/projects/${projectId}`);
      return;
    }
    if (user.referenceType !== 'participant') {
      setError('Only participants can donate');
      return;
    }
    if (!amount || Number(amount) < 1) {
      setError('Please enter a valid amount');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { checkoutUrl } = await paymentsApi.createCheckout(
        projectId,
        Number(amount),
        provider,
        currency,
      );
      window.location.href = checkoutUrl;
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to start payment');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick amounts */}
      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setAmount(String(p))}
            className={cn(
              'py-2 rounded-lg text-sm font-semibold transition-colors',
              amount === String(p)
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            )}
          >
            ${p}
          </button>
        ))}
      </div>

      {/* Amount + currency */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
            {currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}
          </span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="1"
            className="input ps-8 w-full"
          />
        </div>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="input w-24"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-3 text-gray-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('processing')}
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={() => handlePay('stripe')}
            disabled={!amount}
            className="btn-primary w-full justify-center gap-2 disabled:opacity-50"
          >
            <CreditCard className="w-4 h-4" />
            {t('stripe')}
          </button>
          <button
            onClick={() => handlePay('paypal')}
            disabled={!amount}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-[#FFC439] text-[#253B80] hover:bg-[#f0b429] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span className="font-extrabold italic">Pay</span>
            <span className="font-extrabold italic text-[#179BD7]">Pal</span>
          </button>
        </div>
      )}

      {!user && (
        <p className="text-center text-xs text-gray-400">
          You'll be asked to sign in before donating
        </p>
      )}
    </div>
  );
}
