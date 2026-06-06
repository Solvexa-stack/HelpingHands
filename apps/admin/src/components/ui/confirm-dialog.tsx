'use client';

import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  danger?: boolean;
}

export function ConfirmDialog({ title, message, onConfirm, onCancel, loading, danger }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="p-6">
          <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mb-4', danger ? 'bg-red-100' : 'bg-yellow-100')}>
            <AlertTriangle className={cn('w-6 h-6', danger ? 'text-red-600' : 'text-yellow-600')} />
          </div>
          <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
          <p className="text-gray-500 text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onCancel} className="flex-1 btn-secondary btn-md">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn('flex-1 btn btn-md', danger ? 'bg-red-600 text-white hover:bg-red-700' : 'btn-primary')}
          >
            {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
