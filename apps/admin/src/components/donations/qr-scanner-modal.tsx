'use client';

import { useState } from 'react';
import { ScanBarcode, X, Search } from 'lucide-react';
import { donationsApi } from '@/lib/api';
import { formatCurrency, getTranslation, STATUS_COLORS } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  onClose: () => void;
  onFound: (donation: any) => void;
}

export function QrScannerModal({ onClose, onFound }: Props) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const lookup = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      // Extract token from URL if pasted as full URL
      const extracted = token.includes('/donations/')
        ? token.split('/donations/').pop()?.split('?')[0] || token
        : token;
      const donation = await donationsApi.getByToken(extracted);
      setResult(donation);
    } catch {
      setError('No donation found for this token or QR code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ScanBarcode className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold text-gray-900">QR Code Verification</h2>
          </div>
          <button onClick={onClose} className="btn-ghost btn-sm p-1.5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">
            Enter the donation token or paste the full QR code URL to look up a donation.
          </p>

          <div className="flex gap-2">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookup()}
              className="input flex-1"
              placeholder="Token or full URL..."
              autoFocus
            />
            <button onClick={lookup} disabled={loading || !token} className="btn-primary btn-md">
              {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Search className="w-4 h-4" />}
            </button>
          </div>

          {error && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {result && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Donation #{result.id}</h3>
                <span className={cn('badge', STATUS_COLORS[result.status])}>{result.status}</span>
              </div>

              <table className="w-full text-sm">
                <tbody className="space-y-1">
                  {[
                    ['Participant', `${result.participant?.firstName} ${result.participant?.lastName}`],
                    ['Project', getTranslation(result.project?.block?.translations || [])?.name || '—'],
                    ['Amount', formatCurrency(Number(result.amount))],
                  ].map(([l, v]) => (
                    <tr key={l}>
                      <td className="py-1 text-gray-500 w-24">{l}</td>
                      <td className="py-1 font-medium text-gray-900">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {result.status === 'pending' && (
                <button
                  onClick={() => onFound(result)}
                  className="btn-primary btn-md w-full mt-2 justify-center"
                >
                  Process This Donation
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
