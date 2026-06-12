'use client';

import { useState } from 'react';
import { X, ArrowRight, CheckCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';

type TransitionDef = { status: string; labelKey: string; descKey: string; variant: 'primary' | 'danger' | 'default' };

const TRANSITIONS: Record<string, TransitionDef[]> = {
  draft: [
    { status: 'in_review', labelKey: 'studies.transitions.submitForReview', descKey: 'studies.transitions.submitForReviewDesc', variant: 'primary' },
  ],
  in_review: [
    { status: 'published', labelKey: 'studies.transitions.publishStudy', descKey: 'studies.transitions.publishStudyDesc', variant: 'primary' },
    { status: 'draft', labelKey: 'studies.transitions.returnToDraft', descKey: 'studies.transitions.returnToDraftDesc', variant: 'default' },
  ],
  published: [
    { status: 'voting_open', labelKey: 'studies.transitions.openVoting', descKey: 'studies.transitions.openVotingDesc', variant: 'primary' },
  ],
  voting_open: [
    { status: 'voting_closed', labelKey: 'studies.transitions.closeVoting', descKey: 'studies.transitions.closeVotingDesc', variant: 'default' },
  ],
  voting_closed: [
    { status: 'approved', labelKey: 'studies.transitions.approveStudy', descKey: 'studies.transitions.approveStudyDesc', variant: 'primary' },
    { status: 'rejected', labelKey: 'studies.transitions.rejectStudy', descKey: 'studies.transitions.rejectStudyDesc', variant: 'danger' },
  ],
};

interface Props {
  study: any;
  onClose: () => void;
  onSubmit: (status: string, rejectionReason?: string) => void;
  loading?: boolean;
}

export function ChangeStudyStatusModal({ study, onClose, onSubmit, loading }: Props) {
  const { t } = useLanguage();
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const transitions = TRANSITIONS[study.status] ?? [];

  const handleConfirm = () => {
    if (!selected) return;
    onSubmit(selected, selected === 'rejected' ? reason : undefined);
  };

  const btnClass = (variant: string) => {
    if (variant === 'primary') return 'btn btn-md bg-primary-600 text-white hover:bg-primary-700 gap-2 w-full justify-start';
    if (variant === 'danger') return 'btn btn-md bg-red-50 text-red-600 hover:bg-red-100 gap-2 w-full justify-start';
    return 'btn btn-md bg-gray-100 text-gray-700 hover:bg-gray-200 gap-2 w-full justify-start';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t('studies.modal.title')}</h2>
          <button onClick={onClose} className="btn-ghost btn-sm p-1.5"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {transitions.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">{t('studies.modal.noTransitions')}</p>
          ) : (
            <>
              <p className="text-sm text-gray-500">{t('studies.modal.selectNext')}</p>
              <div className="space-y-2">
                {transitions.map((tr) => (
                  <button
                    key={tr.status}
                    onClick={() => setSelected(tr.status)}
                    className={btnClass(tr.variant) + (selected === tr.status ? ' ring-2 ring-offset-1 ring-primary-500' : '')}
                  >
                    <ArrowRight className="w-4 h-4 flex-shrink-0" />
                    <div className="text-left">
                      <p className="font-medium text-sm">{t(tr.labelKey)}</p>
                      <p className="text-xs opacity-70">{t(tr.descKey)}</p>
                    </div>
                  </button>
                ))}
              </div>

              {selected === 'rejected' && (
                <div>
                  <label className="label">{t('studies.modal.rejectionLabel')} <span className="text-red-500">*</span></label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="input resize-none"
                    placeholder={t('studies.modal.rejectionPlaceholder')}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 btn-secondary btn-md">{t('common.cancel')}</button>
                <button
                  onClick={handleConfirm}
                  disabled={loading || !selected || (selected === 'rejected' && !reason.trim())}
                  className="flex-1 btn-primary btn-md gap-2"
                >
                  {loading ? (
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {t('studies.modal.confirm')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
