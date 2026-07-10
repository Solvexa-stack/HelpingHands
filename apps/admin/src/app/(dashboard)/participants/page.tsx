'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ToggleLeft, ToggleRight, Eye } from 'lucide-react';
import Link from 'next/link';
import { participantsApi } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { useLanguage } from '@/contexts/language-context';

export default function ParticipantsPage() {
  const { locale } = useLanguage();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['participants', search, page],
    queryFn: () => participantsApi.list({ search: search || undefined, page, limit: 20 }),
  });

  const participants = data?.data || [];
  const meta = data?.meta || {};

  const toggleMutation = useMutation({
    mutationFn: (id: number) => participantsApi.toggleActive(id),
    onSuccess: () => { success('Status updated'); qc.invalidateQueries({ queryKey: ['participants'] }); },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Failed'),
  });

  return (
    <div className="space-y-5">
      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input ps-9" placeholder="Search participants..." />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Participant</th>
              <th className="table-header">Email</th>
              <th className="table-header">Type</th>
              <th className="table-header">Donations</th>
              <th className="table-header">Joined</th>
              <th className="table-header">Status</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={7} className="table-cell text-center py-12 text-gray-400">Loading...</td></tr>
            ) : participants.length === 0 ? (
              <tr><td colSpan={7} className="table-cell text-center py-12 text-gray-400">No participants found</td></tr>
            ) : (
              participants.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-bold">
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                      <p className="font-medium">{p.firstName} {p.lastName}</p>
                    </div>
                  </td>
                  <td className="table-cell text-gray-500">{p.user?.email}</td>
                  <td className="table-cell capitalize">{p.representation}</td>
                  <td className="table-cell">{p._count?.donations || 0}</td>
                  <td className="table-cell text-gray-400">{p.user?.joiningDate ? formatDate(p.user.joiningDate, locale) : '—'}</td>
                  <td className="table-cell">
                    <span className={cn('badge', p.user?.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                      {p.user?.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1.5">
                      <Link href={`/participants/${p.id}`} className="btn-ghost btn-sm p-1.5 rounded-lg text-gray-500">
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={() => toggleMutation.mutate(p.id)}
                        className={cn('btn btn-sm p-1.5 rounded-lg', p.user?.isActive ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100')}
                      >
                        {p.user?.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {meta?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">{meta.total} total</p>
            <div className="flex gap-1">
              {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((pg) => (
                <button key={pg} onClick={() => setPage(pg)} className={cn('w-8 h-8 rounded-lg text-sm', pg === page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>{pg}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
