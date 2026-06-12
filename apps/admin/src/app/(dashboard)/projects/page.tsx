'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Pencil, Trash2, Eye, FlaskConical, Loader2 } from 'lucide-react';
import { projectsApi, studiesApi } from '@/lib/api';
import { formatCurrency, formatDate, getTranslation, cn } from '@/lib/utils';
import { StudyStatusBadge } from '@/components/study/study-status-badge';
import { useToast } from '@/components/ui/toaster';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/auth-context';

export default function ProjectsPage() {
  const { success, error: toastError } = useToast();
  const { user } = useAuth();
  const role = user?.admin?.role || '';
  const qc = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [creatingStudyFor, setCreatingStudyFor] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-projects', search, page],
    queryFn: () => projectsApi.list({ search: search || undefined, page, limit: 20 }),
  });

  const projects = data?.data || [];
  const meta = data?.meta || {};

  const deleteMutation = useMutation({
    mutationFn: (id: number) => projectsApi.delete(id),
    onSuccess: () => {
      success('Project deleted');
      qc.invalidateQueries({ queryKey: ['admin-projects'] });
      setDeleteId(null);
    },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Delete failed'),
  });

  const createStudyMutation = useMutation({
    mutationFn: (projectId: number) => studiesApi.create(projectId),
    onSuccess: (study) => {
      success('Study created');
      router.push(`/studies/${study.id}`);
    },
    onError: (err: any) => {
      toastError(err?.response?.data?.message || 'Failed to create study');
      setCreatingStudyFor(null);
    },
  });

  const handleCreateStudy = (projectId: number) => {
    setCreatingStudyFor(projectId);
    createStudyMutation.mutate(projectId);
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input pl-9" placeholder="Search projects..." />
        </div>
        {role !== 'financial_officer' && (
          <Link href="/projects/new" className="btn-primary btn-md gap-2">
            <Plus className="w-4 h-4" /> New Project
          </Link>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Project</th>
                <th className="table-header">Category</th>
                <th className="table-header">Target</th>
                <th className="table-header">Progress</th>
                <th className="table-header">Status</th>
                <th className="table-header">Study</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={7} className="table-cell text-center py-12 text-gray-400">Loading...</td></tr>
              ) : projects.length === 0 ? (
                <tr><td colSpan={7} className="table-cell text-center py-12 text-gray-400">No projects found</td></tr>
              ) : (
                projects.map((p: any) => {
                  const name = getTranslation(p.block?.translations || [])?.name || 'Unnamed';
                  const isCreating = creatingStudyFor === p.id && createStudyMutation.isPending;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <p className="font-medium max-w-52 truncate">{name}</p>
                        {p.location && <p className="text-xs text-gray-400">{p.location}</p>}
                      </td>
                      <td className="table-cell capitalize">{p.category}</td>
                      <td className="table-cell font-semibold">{formatCurrency(Number(p.value))}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2 min-w-24">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-primary-600 rounded-full" style={{ width: `${Math.min(Number(p.progression), 100)}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 w-10">{Number(p.progression).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className={cn('badge', p.isCompleted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>
                          {p.isCompleted ? 'Completed' : 'Active'}
                        </span>
                      </td>
                      <td className="table-cell">
                        {p.studyStatus ? (
                          <StudyStatusBadge status={p.studyStatus} size="sm" />
                        ) : role === 'administrator' || role === 'employee' ? (
                          <button
                            onClick={() => handleCreateStudy(p.id)}
                            disabled={isCreating}
                            className="btn btn-sm bg-purple-50 text-purple-700 hover:bg-purple-100 gap-1.5 text-xs py-1 px-2.5 rounded-lg"
                          >
                            {isCreating ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <FlaskConical className="w-3 h-3" />
                            )}
                            Create Study
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <div className="flex gap-1.5">
                          <Link href={`/projects/${p.id}`} className="btn-ghost btn-sm p-1.5 rounded-lg text-gray-500">
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                          {role !== 'financial_officer' && (
                            <Link href={`/projects/${p.id}/edit`} className="btn-ghost btn-sm p-1.5 rounded-lg text-gray-500">
                              <Pencil className="w-3.5 h-3.5" />
                            </Link>
                          )}
                          {role === 'administrator' && (
                            <button onClick={() => setDeleteId(p.id)} className="btn btn-sm bg-red-50 text-red-500 hover:bg-red-100 p-1.5 rounded-lg">
                              <Trash2 className="w-3.5 h-3.5" />
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
        {meta?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">{meta.total} total</p>
            <div className="flex gap-1">
              {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((pg) => (
                <button key={pg} onClick={() => setPage(pg)} className={cn('w-8 h-8 rounded-lg text-sm', pg === page ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
                  {pg}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {deleteId && (
        <ConfirmDialog
          title="Delete Project"
          message="Are you sure you want to delete this project? This action cannot be undone."
          onConfirm={() => deleteMutation.mutate(deleteId)}
          onCancel={() => setDeleteId(null)}
          loading={deleteMutation.isPending}
          danger
        />
      )}
    </div>
  );
}
