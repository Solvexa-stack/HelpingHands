'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import { adminsApi } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { CreateAdminModal } from '@/components/admins/create-admin-modal';
import { EditAdminModal } from '@/components/admins/edit-admin-modal';
import { useLanguage } from '@/contexts/language-context';

const ROLE_COLORS: Record<string, string> = {
  administrator: 'bg-purple-100 text-purple-700',
  employee: 'bg-blue-100 text-blue-700',
  financial_officer: 'bg-emerald-100 text-emerald-700',
};

export default function EmployeesPage() {
  const { t, locale } = useLanguage();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editAdmin, setEditAdmin] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admins', search],
    queryFn: () => adminsApi.list({ search: search || undefined }),
  });

  const admins = data?.data || [];

  const toggleMutation = useMutation({
    mutationFn: (id: number) => adminsApi.toggleActive(id),
    onSuccess: () => { success(t('employees.toast.statusUpdated')); qc.invalidateQueries({ queryKey: ['admins'] }); },
    onError: (err: any) => toastError(err?.response?.data?.message || t('common.failed')),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => adminsApi.create(data),
    onSuccess: () => { success(t('employees.toast.accountCreated')); qc.invalidateQueries({ queryKey: ['admins'] }); setCreateOpen(false); },
    onError: (err: any) => toastError(err?.response?.data?.message || t('common.failed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => adminsApi.update(id, data),
    onSuccess: () => { success(t('employees.toast.memberUpdated')); qc.invalidateQueries({ queryKey: ['admins'] }); setEditAdmin(null); },
    onError: (err: any) => toastError(err?.response?.data?.message || t('common.failed')),
  });

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input ps-9" placeholder={t('employees.searchPlaceholder')} />
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary btn-md gap-2">
          <Plus className="w-4 h-4" /> {t('employees.addMember')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">{t('employees.name')}</th>
              <th className="table-header">{t('employees.email')}</th>
              <th className="table-header">{t('employees.role')}</th>
              <th className="table-header">{t('employees.joined')}</th>
              <th className="table-header">{t('common.status')}</th>
              <th className="table-header">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={6} className="table-cell text-center py-12 text-gray-400">{t('common.loading')}</td></tr>
            ) : admins.length === 0 ? (
              <tr><td colSpan={6} className="table-cell text-center py-12 text-gray-400">{t('employees.empty')}</td></tr>
            ) : (
              admins.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-bold">
                        {a.firstName[0]}{a.lastName[0]}
                      </div>
                      <p className="font-medium">{a.firstName} {a.lastName}</p>
                    </div>
                  </td>
                  <td className="table-cell text-gray-500">{a.user?.email}</td>
                  <td className="table-cell">
                    <span className={cn('badge capitalize', ROLE_COLORS[a.role] || 'bg-gray-100 text-gray-600')}>
                      {t(`roles.${a.role}`) || a.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="table-cell text-gray-400">{a.user?.joiningDate ? formatDate(a.user.joiningDate, locale) : '—'}</td>
                  <td className="table-cell">
                    <span className={cn('badge', a.user?.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                      {a.user?.isActive ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setEditAdmin(a)}
                        className="btn-ghost btn-sm p-1.5 rounded-lg text-gray-500 hover:text-primary-600"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {a.role !== 'administrator' && (
                        <button
                          onClick={() => toggleMutation.mutate(a.id)}
                          className={cn('btn btn-sm p-1.5 rounded-lg', a.user?.isActive ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100')}
                        >
                          {a.user?.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <CreateAdminModal
          onClose={() => setCreateOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          loading={createMutation.isPending}
        />
      )}

      {editAdmin && (
        <EditAdminModal
          admin={editAdmin}
          onClose={() => setEditAdmin(null)}
          onSubmit={(id, data) => updateMutation.mutate({ id, data })}
          loading={updateMutation.isPending}
        />
      )}
    </div>
  );
}
