'use client';

import { useState } from 'react';
import { X, CheckCircle, XCircle } from 'lucide-react';
import { formatCurrency, getTranslation } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

interface Props {
  donation: any;
  onClose: () => void;
  onSubmit: (status: string, notes?: string) => void;
  loading?: boolean;
}

export function DonationStatusModal({ donation, onClose, onSubmit, loading }: Props) {
  const { t, locale } = useLanguage();
  const [notes, setNotes] = useState('');

  const projectName = getTranslation(donation.project?.block?.translations || [])?.name || t('common.notAvailable');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('donations.verify.title', { id: donation.id })}</h2>
          <button onClick={onClose} className="btn-ghost btn-sm p-1.5"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Donation summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('donations.participant')}</span>
              <span className="font-semibold">{donation.participant?.firstName} {donation.participant?.lastName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('donations.project')}</span>
              <span className="font-semibold truncate max-w-40">{projectName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('donations.amount')}</span>
              <span className="font-bold text-primary-600 text-base">{formatCurrency(Number(donation.amount), undefined, locale)}</span>
            </div>
          </div>

          <div>
            <label className="label">{t('donations.verify.notesLabel')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="input resize-none"
              placeholder={t('donations.verify.notesPlaceholder')}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => onSubmit('rejected', notes || undefined)}
              disabled={loading}
              className="flex-1 btn btn-md bg-red-50 text-red-600 hover:bg-red-100 gap-2"
            >
              <XCircle className="w-4 h-4" />
              {t('donations.verify.reject')}
            </button>
            <button
              onClick={() => onSubmit('approved', notes || undefined)}
              disabled={loading}
              className="flex-1 btn-primary btn-md gap-2"
            >
              {loading ? (
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              ) : <CheckCircle className="w-4 h-4" />}
              {t('donations.verify.approve')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
