'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ScanBarcode, CheckCircle, QrCode, Download } from 'lucide-react';
import { donationsApi } from '@/lib/api';
import { formatCurrency, formatDate, getTranslation, STATUS_COLORS, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { QrScannerModal } from '@/components/donations/qr-scanner-modal';
import { DonationStatusModal } from '@/components/donations/donation-status-modal';
import { useLanguage } from '@/contexts/language-context';

const statuses = ['', 'pending', 'approved', 'rejected', 'cancelled'];
const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:4000/api';

function exportCsv(donations: any[]) {
  const headers = ['ID', 'Participant', 'Email', 'Project', 'Amount', 'Status', 'Date', 'Approved At'];
  const rows = donations.map((d) => [
    d.id,
    `${d.participant?.firstName || ''} ${d.participant?.lastName || ''}`.trim(),
    d.participant?.user?.email || '',
    getTranslation(d.project?.block?.translations || [])?.name || '',
    Number(d.amount).toFixed(2),
    d.status,
    d.createdAt ? new Date(d.createdAt).toISOString().split('T')[0] : '',
    d.approvedAt ? new Date(d.approvedAt).toISOString().split('T')[0] : '',
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `donations-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadQr(token: string) {
  const link = document.createElement('a');
  link.href = `${API_URL}/v1/donations/${token}/qr/download`;
  link.download = `qr-${token}.png`;
  const accessToken = localStorage.getItem('admin_access_token') || '';
  fetch(link.href, { headers: { Authorization: `Bearer ${accessToken}` } })
    .then((r) => r.blob())
    .then((blob) => {
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    });
}

export default function DonationsPage() {
  const { t, locale } = useLanguage();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [scanOpen, setScanOpen] = useState(false);
  const [statusModal, setStatusModal] = useState<{ donation: any } | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await donationsApi.list({ status: status || undefined, search: search || undefined, limit: 10000 });
      exportCsv(result?.data || []);
    } finally {
      setExporting(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['donations', status, search, page],
    queryFn: () => donationsApi.list({ status: status || undefined, search: search || undefined, page, limit: 20 }),
  });

  const donations = data?.data || [];
  const meta = data?.meta || {};

  const updateMutation = useMutation({
    mutationFn: ({ id, status, notes }: any) => donationsApi.updateStatus(id, { status, notes }),
    onSuccess: () => {
      success(t('donations.toast.updated'));
      qc.invalidateQueries({ queryKey: ['donations'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setStatusModal(null);
    },
    onError: (err: any) => toastError(err?.response?.data?.message || t('donations.toast.updateFailed')),
  });

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('donations.searchPlaceholder')}
            className="input ps-9"
          />
        </div>

        {/* Status filter */}
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="input w-40"
        >
          <option value="">{t('donations.allStatuses')}</option>
          {statuses.filter(Boolean).map((s) => (
            <option key={s} value={s}>{t(`donations.statuses.${s}`) || s}</option>
          ))}
        </select>

        {/* Export CSV */}
        <button onClick={handleExport} disabled={exporting} className="btn-secondary btn-md gap-2">
          <Download className="w-4 h-4" />
          {exporting ? t('donations.exporting') : t('donations.exportCsv')}
        </button>

        {/* QR Scanner */}
        <button onClick={() => setScanOpen(true)} className="btn-primary btn-md gap-2">
          <ScanBarcode className="w-4 h-4" />
          {t('donations.scanQr')}
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">{t('donations.id')}</th>
                <th className="table-header">{t('donations.participant')}</th>
                <th className="table-header">{t('donations.project')}</th>
                <th className="table-header">{t('donations.amount')}</th>
                <th className="table-header">{t('donations.status')}</th>
                <th className="table-header">{t('donations.date')}</th>
                <th className="table-header">{t('donations.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="table-cell text-center py-12 text-gray-400">{t('donations.loadingRow')}</td>
                </tr>
              ) : donations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-cell text-center py-12 text-gray-400">{t('donations.noDonationsFound')}</td>
                </tr>
              ) : (
                donations.map((d: any) => {
                  const projectName = getTranslation(d.project?.block?.translations || [])?.name;
                  return (
                    <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium">#{d.id}</td>
                      <td className="table-cell">
                        <div>
                          <p className="font-medium">{d.participant?.firstName} {d.participant?.lastName}</p>
                          <p className="text-xs text-gray-400">{d.participant?.user?.email}</p>
                        </div>
                      </td>
                      <td className="table-cell max-w-48">
                        <p className="truncate">{projectName || '—'}</p>
                      </td>
                      <td className="table-cell font-semibold">{formatCurrency(Number(d.amount), undefined, locale)}</td>
                      <td className="table-cell">
                        <span className={cn('badge', STATUS_COLORS[d.status])}>{t(`donations.statuses.${d.status}`) || d.status}</span>
                      </td>
                      <td className="table-cell text-gray-400">{formatDate(d.createdAt, locale)}</td>
                      <td className="table-cell">
                        <div className="flex gap-1.5">
                          {d.status === 'pending' && (
                            <button
                              onClick={() => setStatusModal({ donation: d })}
                              className="btn btn-sm bg-primary-50 text-primary-600 hover:bg-primary-100 p-1.5 rounded-lg"
                              title={t('donations.updateStatusTitle')}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {d.qrToken && (
                            <button
                              onClick={() => downloadQr(d.qrToken)}
                              className="btn btn-sm bg-gray-100 text-gray-600 hover:bg-gray-200 p-1.5 rounded-lg"
                              title={t('donations.downloadQrTitle')}
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">{t('donations.totalCount', { count: meta.total })}</p>
            <div className="flex gap-1">
              {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn('w-8 h-8 rounded-lg text-sm font-medium transition-colors', p === page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100')}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {scanOpen && (
        <QrScannerModal
          onClose={() => setScanOpen(false)}
          onFound={(donation) => { setScanOpen(false); setStatusModal({ donation }); }}
        />
      )}

      {statusModal && (
        <DonationStatusModal
          donation={statusModal.donation}
          onClose={() => setStatusModal(null)}
          onSubmit={(status, notes) => updateMutation.mutate({ id: statusModal.donation.id, status, notes })}
          loading={updateMutation.isPending}
        />
      )}
    </div>
  );
}
