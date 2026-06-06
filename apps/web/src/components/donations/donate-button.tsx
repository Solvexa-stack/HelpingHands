'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Heart, QrCode, Download, X } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { donationsApi } from '@/lib/api';

interface DonateButtonProps {
  projectId: number;
  locale: string;
}

export function DonateButton({ projectId, locale }: DonateButtonProps) {
  const t = useTranslations('donate');
  const { user } = useAuth();
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [donation, setDonation] = useState<any>(null);
  const [error, setError] = useState('');

  const presets = [100, 250, 500, 1000, 2500, 5000];

  const handleDonate = async () => {
    if (!user) {
      router.push(`/${locale}/auth/login?redirect=/projects/${projectId}`);
      return;
    }
    if (user.referenceType !== 'participant') {
      setError('Only participants can create donation requests');
      return;
    }
    if (!amount || Number(amount) < 1) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await donationsApi.create({ projectId, amount: Number(amount) });
      setDonation(result);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create donation request');
    } finally {
      setLoading(false);
    }
  };

  if (donation) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-green-600 font-semibold">
          <Heart className="w-5 h-5 fill-current" />
          <span>{t('donationCreated')}</span>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-500 mb-3">{t('qrTitle')}</p>
          {donation.qrDataUrl && (
            <img src={donation.qrDataUrl} alt="Donation QR Code" className="w-48 h-48 mx-auto rounded-lg" />
          )}
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">{t('qrInstructions')}</p>

        <a
          href={donationsApi.downloadQrUrl(donation.qrToken)}
          download={`qr-donation-${donation.id}.png`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary w-full justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          {t('download')}
        </a>

        <button
          onClick={() => { setDonation(null); setAmount(''); }}
          className="w-full text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1"
        >
          <X className="w-3 h-3" /> Make another donation
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick amounts */}
      <div className="grid grid-cols-3 gap-2">
        {presets.map((preset) => (
          <button
            key={preset}
            onClick={() => setAmount(String(preset))}
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
              amount === String(preset)
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            ${preset}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <div>
        <label className="label">{t('amount')}</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('amountPlaceholder')}
            min="1"
            className="input pl-8"
          />
        </div>
      </div>

      {error && (
        <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <button
        onClick={handleDonate}
        disabled={loading || !amount}
        className="btn-primary w-full justify-center gap-2"
      >
        {loading ? (
          <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
        ) : (
          <Heart className="w-4 h-4" />
        )}
        {t('submit')}
      </button>

      {!user && (
        <p className="text-center text-xs text-gray-400">
          You'll be asked to sign in before donating
        </p>
      )}
    </div>
  );
}
