'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, ChevronDown, ChevronRight, FolderTree, Pencil, Plus, X } from 'lucide-react';
import { categoriesApi, type CategoryInput } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

interface CategoryNode extends CategoryInput {
  id: number;
  isActive: boolean;
  children: CategoryNode[];
}

const EMPTY_FORM: CategoryInput = { key: '', name: '', nameAr: '', nameFr: '', description: '', parentId: undefined, order: 0 };

function flatten(nodes: CategoryNode[], depth = 0): Array<{ node: CategoryNode; depth: number }> {
  return nodes.flatMap((n) => [{ node: n, depth }, ...flatten(n.children, depth + 1)]);
}

function CategoryRow({
  node,
  depth,
  onEdit,
  onArchive,
  onActivate,
}: {
  node: CategoryNode;
  depth: number;
  onEdit: (node: CategoryNode) => void;
  onArchive: (id: number) => void;
  onActivate: (id: number) => void;
}) {
  const { t, locale } = useLanguage();
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div style={{ marginInlineStart: depth > 0 ? '1.5rem' : 0 }}>
      <div className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-800">
        {hasChildren ? (
          <button onClick={() => setOpen(!open)} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0">
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-4.5 shrink-0" />
        )}
        <FolderTree className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="font-medium text-sm">
          {locale === 'ar' && node.nameAr ? node.nameAr : locale === 'fr' && node.nameFr ? node.nameFr : node.name}
        </span>
        <span className="text-xs text-gray-400">{node.key}</span>
        <span className={cn('badge', node.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500')}>
          {node.isActive ? t('common.active') : t('sectors.badges.archived')}
        </span>
        <span className="ms-auto flex items-center gap-1 shrink-0">
          <button className="btn-secondary btn-sm gap-1" onClick={() => onEdit(node)}>
            <Pencil className="w-3 h-3" /> {t('common.edit')}
          </button>
          {node.isActive ? (
            <button className="btn-secondary btn-sm gap-1" onClick={() => onArchive(node.id)}>
              <Archive className="w-3 h-3" /> {t('sectors.actions.archive')}
            </button>
          ) : (
            <button className="btn-secondary btn-sm gap-1" onClick={() => onActivate(node.id)}>
              <CheckCircle2 className="w-3 h-3" /> {t('sectors.actions.activate')}
            </button>
          )}
        </span>
      </div>
      {open && node.children.map((child) => (
        <CategoryRow key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onArchive={onArchive} onActivate={onActivate} />
      ))}
    </div>
  );
}

/**
 * W9 — Super Admin sector management: create/edit/archive/reactivate the
 * civic category taxonomy. Never a delete action — sectors are archived
 * (isActive:false), never removed, so financial history (funds, projects,
 * ledger entries) referencing a sector always stays valid. See
 * CategoriesService (apps/api/src/modules/categories) — the write endpoints
 * are gated to platform:super_admin via the `sector.manage` policy action.
 */
export default function CategoriesPage() {
  const { t } = useLanguage();
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryNode | null>(null);
  const [form, setForm] = useState<CategoryInput>(EMPTY_FORM);

  const { data: tree } = useQuery<CategoryNode[]>({ queryKey: ['categories-admin-tree'], queryFn: () => categoriesApi.adminTree() });
  const parentOptions = flatten(tree ?? []);

  const refresh = () => qc.invalidateQueries({ queryKey: ['categories-admin-tree'] });
  const onError = (err: any) => toastError(err?.response?.data?.message || t('common.failed'));

  const createMutation = useMutation({
    mutationFn: () => categoriesApi.create(form),
    onSuccess: () => { success(t('sectors.toast.created')); setFormOpen(false); setForm(EMPTY_FORM); refresh(); },
    onError,
  });
  const updateMutation = useMutation({
    mutationFn: () => categoriesApi.update(editing!.id, form),
    onSuccess: () => { success(t('sectors.toast.updated')); setEditing(null); setForm(EMPTY_FORM); refresh(); },
    onError,
  });
  const archiveMutation = useMutation({
    mutationFn: (id: number) => categoriesApi.archive(id),
    onSuccess: () => { success(t('sectors.toast.archived')); refresh(); },
    onError,
  });
  const activateMutation = useMutation({
    mutationFn: (id: number) => categoriesApi.activate(id),
    onSuccess: () => { success(t('sectors.toast.activated')); refresh(); },
    onError,
  });

  const openEdit = (node: CategoryNode) => {
    setEditing(node);
    setForm({ key: node.key, name: node.name, nameAr: node.nameAr, nameFr: node.nameFr, description: node.description, parentId: node.parentId, order: node.order });
  };

  const closeForm = () => { setFormOpen(false); setEditing(null); setForm(EMPTY_FORM); };
  const isEditing = editing != null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderTree className="w-5 h-5 text-primary-600" />
          <h1 className="text-lg font-semibold">{t('sectors.title')}</h1>
          <span className="text-sm text-gray-400">{t('sectors.subtitle')}</span>
        </div>
        <button onClick={() => setFormOpen(true)} className="btn-primary btn-md gap-2">
          <Plus className="w-4 h-4" /> {t('sectors.newSector')}
        </button>
      </div>

      <div className="card p-5">
        {(tree ?? []).filter((n) => n.parentId == null).map((node) => (
          <CategoryRow
            key={node.id}
            node={node}
            depth={0}
            onEdit={openEdit}
            onArchive={(id) => archiveMutation.mutate(id)}
            onActivate={(id) => activateMutation.mutate(id)}
          />
        ))}
        {(tree ?? []).length === 0 && <p className="text-gray-400 text-sm">{t('sectors.empty')}</p>}
      </div>

      {(formOpen || isEditing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={closeForm}>
          <div className="card p-6 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{isEditing ? t('sectors.editModal.title') : t('sectors.createModal.title')}</h2>
              <button onClick={closeForm}><X className="w-4 h-4" /></button>
            </div>
            {!isEditing && (
              <input
                className="input w-full"
                placeholder={t('sectors.createModal.keyPlaceholder')}
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase() })}
              />
            )}
            <input className="input w-full" placeholder={t('sectors.createModal.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input w-full" placeholder={t('sectors.createModal.nameArPlaceholder')} value={form.nameAr ?? ''} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
            <input className="input w-full" placeholder={t('sectors.createModal.nameFrPlaceholder')} value={form.nameFr ?? ''} onChange={(e) => setForm({ ...form, nameFr: e.target.value })} />
            <textarea className="input w-full" placeholder={t('sectors.createModal.descriptionPlaceholder')} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="space-y-1">
              <label className="text-xs text-gray-500">{t('sectors.createModal.parentLabel')}</label>
              <select
                className="input w-full"
                value={form.parentId ?? ''}
                onChange={(e) => setForm({ ...form, parentId: e.target.value ? Number(e.target.value) : undefined })}
              >
                <option value="">{t('sectors.createModal.parentNone')}</option>
                {parentOptions
                  .filter(({ node }) => !isEditing || node.id !== editing!.id)
                  .map(({ node, depth }) => (
                    <option key={node.id} value={node.id}>{'—'.repeat(depth)} {node.name}</option>
                  ))}
              </select>
            </div>
            <button
              className="btn-primary btn-md w-full"
              disabled={(!isEditing && !form.key) || !form.name}
              onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
            >
              {isEditing ? t('common.save') : t('common.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
