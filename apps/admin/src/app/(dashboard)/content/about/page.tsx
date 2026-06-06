'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Pencil, ToggleRight, ToggleLeft } from 'lucide-react';
import { blocksApi } from '@/lib/api';
import { getTranslation, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';

export default function AboutPage() {
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['blocks-about'],
    queryFn: () => blocksApi.list({ category: 'about_us', activeOnly: false }),
  });
  const blocks = (data as any)?.data || [];

  const toggleMutation = useMutation({
    mutationFn: (id: number) => blocksApi.toggleActive(id),
    onSuccess: () => { success('Updated'); qc.invalidateQueries({ queryKey: ['blocks-about'] }); },
    onError: () => toastError('Failed'),
  });

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Link href="/content/about/new" className="btn-primary btn-md gap-2">
          <Plus className="w-4 h-4" /> Add Section
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {isLoading ? <p className="text-gray-400">Loading...</p> :
          blocks.length === 0 ? <p className="text-gray-400 text-sm">No about us sections yet</p> :
          blocks.map((b: any) => {
            const t = getTranslation(b.translations || []);
            return (
              <div key={b.id} className="card p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{t?.name || 'Untitled'}</h3>
                  <span className={cn('badge', b.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                    {b.isActive ? 'Active' : 'Hidden'}
                  </span>
                </div>
                {t?.brief && <p className="text-gray-500 text-sm line-clamp-2">{t.brief}</p>}
                <div className="flex gap-2 pt-1">
                  <Link href={`/content/about/${b.id}/edit`} className="btn-secondary btn-sm gap-1.5">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Link>
                  <button onClick={() => toggleMutation.mutate(b.id)} className="btn-ghost btn-sm gap-1.5">
                    {b.isActive ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                    {b.isActive ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
