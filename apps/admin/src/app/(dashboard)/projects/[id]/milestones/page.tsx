'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { milestonesApi } from '@/lib/api';
import { useLanguage } from '@/contexts/language-context';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Loader2, CheckCircle2, Clock, AlertCircle, Circle, ArrowLeft } from 'lucide-react';

const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
  pending: { color: 'text-gray-400', icon: Circle },
  in_progress: { color: 'text-yellow-500', icon: Clock },
  completed: { color: 'text-green-500', icon: CheckCircle2 },
  missed: { color: 'text-red-500', icon: AlertCircle },
};

const STATUSES = ['pending', 'in_progress', 'completed', 'missed'];

function Modal({ title, onClose, onSave, saving, children }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-4">{children}</div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
          <button onClick={onSave} disabled={saving} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function MilestonesPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { t } = useLanguage();
  const { user } = useAuth();
  const role = user?.admin?.role || '';
  const canEdit = role === 'administrator' || role === 'employee';

  const [milestones, setMilestones] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await milestonesApi.list(projectId);
      setMilestones(data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({}); setModal(true); };
  const openEdit = (m: any) => {
    setEditing(m);
    setForm({
      blockId: m.blockId,
      status: m.status,
      targetDate: m.targetDate?.split('T')[0],
      completedAt: m.completedAt?.split('T')[0],
    });
    setModal(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) await milestonesApi.update(projectId, editing.id, form);
      else await milestonesApi.create(projectId, form);
      setModal(false);
      load();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const remove = async (milestoneId: number) => {
    if (!confirm('Delete this milestone?')) return;
    await milestonesApi.delete(projectId, milestoneId);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('milestones.title')}</h1>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
            <Plus className="w-4 h-4" />{t('milestones.addMilestone')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
      ) : milestones.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center py-16 text-gray-400">
          <Circle className="w-10 h-10 mb-3 opacity-40" />
          <p>{t('milestones.noMilestones')}</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-4">
            {milestones.map((m) => {
              const cfg = STATUS_CONFIG[m.status] || STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const name = m.block?.translations?.[0]?.name || `Milestone #${m.id}`;

              return (
                <div key={m.id} className="relative flex gap-4">
                  <div className={cn('relative z-10 flex-shrink-0 w-12 flex items-center justify-center', cfg.color)}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{name}</h3>
                        {m.block?.translations?.[0]?.brief && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{m.block.translations[0].brief}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span className={cn('px-2 py-0.5 rounded-full font-medium', {
                            'bg-gray-100 dark:bg-gray-800': m.status === 'pending',
                            'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400': m.status === 'in_progress',
                            'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': m.status === 'completed',
                            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': m.status === 'missed',
                          })}>
                            {t(`milestones.statuses.${m.status}`) || m.status}
                          </span>
                          {m.targetDate && (
                            <span>{t('milestones.targetDate')}: {new Date(m.targetDate).toLocaleDateString()}</span>
                          )}
                          {m.completedAt && (
                            <span className="text-green-600">{t('milestones.completedAt')}: {new Date(m.completedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex gap-1 flex-shrink-0 ml-4">
                          <button onClick={() => openEdit(m)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => remove(m.id)} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modal && (
        <Modal title={editing ? t('milestones.editMilestone') : t('milestones.addMilestone')} onClose={() => setModal(false)} onSave={save} saving={saving}>
          {!editing && (
            <Field label="Block ID">
              <input type="number" value={form.blockId || ''} onChange={(e) => setForm({ ...form, blockId: Number(e.target.value) })} className={INPUT} placeholder="Block ID for content" />
            </Field>
          )}
          <Field label={t('milestones.status')}>
            <select value={form.status || 'pending'} onChange={(e) => setForm({ ...form, status: e.target.value })} className={INPUT}>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`milestones.statuses.${s}`) || s}</option>)}
            </select>
          </Field>
          <Field label={t('milestones.targetDate')}>
            <input type="date" value={form.targetDate || ''} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('milestones.completedAt')}>
            <input type="date" value={form.completedAt || ''} onChange={(e) => setForm({ ...form, completedAt: e.target.value })} className={INPUT} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
