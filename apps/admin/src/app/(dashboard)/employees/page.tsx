'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import { adminsApi } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { CreateAdminModal } from '@/components/admins/create-admin-modal';

const ROLE_COLORS: Record<string, string> = {
  administrator: 'bg-purple-100 text-purple-700',
  employee: 'bg-blue-100 text-blue-700',
  financial_officer: 'bg-emerald-100 text-emerald-700',
};

export default function EmployeesPage() {
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admins', search],
    queryFn: () => adminsApi.list({ search: search || undefined }),
  });

  const admins = data?.data || [];

  const toggleMutation = useMutation({
    mutationFn: (id: number) => adminsApi.toggleActive(id),
    onSuccess: () => { success('Status updated'); qc.invalidateQueries({ queryKey: ['admins'] }); },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Failed'),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => adminsApi.create(data),
    onSuccess: () => { success('Account created!'); qc.invalidateQueries({ queryKey: ['admins'] }); setCreateOpen(false); },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Create failed'),
  });

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder="Search team members..." />
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary btn-md gap-2">
          <Plus className="w-4 h-4" /> Add Member
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Name</th>
              <th className="table-header">Email</th>
              <th className="table-header">Role</th>
              <th className="table-header">Joined</th>
              <th className="table-header">Status</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={6} className="table-cell text-center py-12 text-gray-400">Loading...</td></tr>
            ) : admins.length === 0 ? (
              <tr><td colSpan={6} className="table-cell text-center py-12 text-gray-400">No team members found</td></tr>
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
                      {a.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="table-cell text-gray-400">{a.user?.joiningDate ? formatDate(a.user.joiningDate) : '—'}</td>
                  <td className="table-cell">
                    <span className={cn('badge', a.user?.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                      {a.user?.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell">
                    {a.role !== 'administrator' && (
                      <button
                        onClick={() => toggleMutation.mutate(a.id)}
                        className={cn('btn btn-sm p-1.5 rounded-lg', a.user?.isActive ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100')}
                      >
                        {a.user?.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      </button>
                    )}
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
    </div>
  );
}
