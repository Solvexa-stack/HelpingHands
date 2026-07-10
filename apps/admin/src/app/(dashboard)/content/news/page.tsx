'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Search, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { blocksApi } from '@/lib/api';
import { formatDate, getTranslation, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useLanguage } from '@/contexts/language-context';

const LIMIT = 15;

export default function NewsPage() {
  const { locale } = useLanguage();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['blocks-news', search, page],
    queryFn: () => blocksApi.list({ category: 'news', search: search || undefined, activeOnly: false, page, limit: LIMIT }),
  });
  const blocks = (data as any)?.data || [];
  const meta = (data as any)?.meta || {};

  const toggleMutation = useMutation({
    mutationFn: (id: number) => blocksApi.toggleActive(id),
    onSuccess: () => { success('Updated'); qc.invalidateQueries({ queryKey: ['blocks-news'] }); },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => blocksApi.delete(id),
    onSuccess: () => { success('Deleted'); qc.invalidateQueries({ queryKey: ['blocks-news'] }); setDeleteId(null); },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Failed'),
  });

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input pl-9" placeholder="Search news..." />
        </div>
        <Link href="/content/news/new" className="btn-primary btn-md gap-2">
          <Plus className="w-4 h-4" /> New Article
        </Link>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Title</th>
              <th className="table-header">Slug</th>
              <th className="table-header">Date</th>
              <th className="table-header">Status</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={5} className="table-cell text-center py-12 text-gray-400">Loading...</td></tr>
            ) : blocks.length === 0 ? (
              <tr><td colSpan={5} className="table-cell text-center py-12 text-gray-400">No news articles yet</td></tr>
            ) : blocks.map((b: any) => {
              const t = getTranslation(b.translations || []);
              return (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-cell font-medium max-w-56 truncate">{t?.name || 'Untitled'}</td>
                  <td className="table-cell text-gray-400 font-mono text-xs max-w-40 truncate">{t?.slug}</td>
                  <td className="table-cell text-gray-400">{formatDate(b.createdAt, locale)}</td>
                  <td className="table-cell">
                    <span className={cn('badge', b.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {b.isActive ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1.5">
                      <Link href={`/content/news/${b.id}/edit`} className="btn-ghost btn-sm p-1.5 rounded-lg text-gray-500"><Pencil className="w-3.5 h-3.5" /></Link>
                      <button onClick={() => toggleMutation.mutate(b.id)} className="btn-ghost btn-sm p-1.5 rounded-lg">
                        {b.isActive ? <ToggleRight className="w-3.5 h-3.5 text-green-500" /> : <ToggleLeft className="w-3.5 h-3.5 text-gray-400" />}
                      </button>
                      <button onClick={() => setDeleteId(b.id)} className="btn btn-sm p-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {meta?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">{meta.total} total</p>
            <div className="flex gap-1">
              {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((pg) => (
                <button key={pg} onClick={() => setPage(pg)}
                  className={cn('w-8 h-8 rounded-lg text-sm', pg === page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
                  {pg}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {deleteId && <ConfirmDialog title="Delete Article" message="Delete this news article?" onConfirm={() => deleteMutation.mutate(deleteId)} onCancel={() => setDeleteId(null)} loading={deleteMutation.isPending} danger />}
    </div>
  );
}
