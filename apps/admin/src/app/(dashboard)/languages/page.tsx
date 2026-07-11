'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Globe } from 'lucide-react';
import { languagesApi } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

export default function LanguagesPage() {
  const { t } = useLanguage();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [deleteCode, setDeleteCode] = useState<string | null>(null);
  const [editLang, setEditLang] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', flagCode: '', direction: 'ltr', order: 0, isActive: true });

  const { data: languages, isLoading } = useQuery({
    queryKey: ['languages'],
    queryFn: languagesApi.list,
  });

  const toggleMutation = useMutation({
    mutationFn: (code: string) => languagesApi.toggle(code),
    onSuccess: () => { success(t('languagesPage.toast.updated')); qc.invalidateQueries({ queryKey: ['languages'] }); },
    onError: (err: any) => toastError(err?.response?.data?.message || t('common.failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (code: string) => languagesApi.delete(code),
    onSuccess: () => { success(t('languagesPage.toast.deleted')); qc.invalidateQueries({ queryKey: ['languages'] }); setDeleteCode(null); },
    onError: (err: any) => toastError(err?.response?.data?.message || t('common.failed')),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => languagesApi.create(data),
    onSuccess: () => { success(t('languagesPage.toast.added')); qc.invalidateQueries({ queryKey: ['languages'] }); setCreateOpen(false); resetForm(); },
    onError: (err: any) => toastError(err?.response?.data?.message || t('common.failed')),
  });

  const resetForm = () => setForm({ name: '', code: '', flagCode: '', direction: 'ltr', order: 0, isActive: true });

  return (
    <div className="space-y-5">
      <div className="flex justify-between">
        <p className="text-gray-500 text-sm">{t('languagesPage.configuredCount', { count: (languages as any[])?.length || 0 })}</p>
        <button onClick={() => setCreateOpen(true)} className="btn-primary btn-md gap-2">
          <Plus className="w-4 h-4" /> {t('languagesPage.addLanguage')}
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <p className="text-gray-400">{t('common.loading')}</p>
        ) : (
          (languages as any[])?.map((lang) => (
            <div key={lang.code} className="card p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Globe className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{lang.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono uppercase">{lang.code}</span>
                    <span className="text-xs text-gray-400">{lang.direction.toUpperCase()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn('badge text-xs', lang.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                  {lang.isActive ? t('content.active') : t('languagesPage.off')}
                </span>
                <button onClick={() => toggleMutation.mutate(lang.code)} className="btn-ghost btn-sm p-1.5">
                  {lang.isActive ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                </button>
                <button onClick={() => setDeleteCode(lang.code)} className="btn btn-sm p-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">{t('languagesPage.addLanguage')}</h2>
            <div><label className="label">{t('languagesPage.nameLabel')}</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder={t('languagesPage.namePlaceholder')} /></div>
            <div><label className="label">{t('languagesPage.codeLabel')}</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="input" placeholder={t('languagesPage.codePlaceholder')} /></div>
            <div><label className="label">{t('languagesPage.flagCodeLabel')}</label><input value={form.flagCode} onChange={(e) => setForm({ ...form, flagCode: e.target.value })} className="input" placeholder={t('languagesPage.flagCodePlaceholder')} /></div>
            <div>
              <label className="label">{t('languagesPage.directionLabel')}</label>
              <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} className="input">
                <option value="ltr">{t('languagesPage.directionLtr')}</option>
                <option value="rtl">{t('languagesPage.directionRtl')}</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setCreateOpen(false); resetForm(); }} className="flex-1 btn-secondary btn-md">{t('common.cancel')}</button>
              <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.name || !form.code} className="flex-1 btn-primary btn-md">
                {createMutation.isPending ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : t('languagesPage.add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteCode && (
        <ConfirmDialog
          title={t('languagesPage.deleteTitle')}
          message={t('languagesPage.deleteMessage', { code: deleteCode })}
          onConfirm={() => deleteMutation.mutate(deleteCode)}
          onCancel={() => setDeleteCode(null)}
          loading={deleteMutation.isPending}
          danger
        />
      )}
    </div>
  );
}
