'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { executionApi } from '@/lib/api';
import { useLanguage } from '@/contexts/language-context';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown, Loader2, ArrowLeft,
} from 'lucide-react';

type Tab = 'phases' | 'steps' | 'tasks';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  verified: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

function StatusBadge({ status, ns = 'statuses' }: { status: string; ns?: string }) {
  const { t } = useLanguage();
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[status] || STATUS_COLORS.pending)}>
      {t(`execution.${ns}.${status}`) || status}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
      <div className="bg-primary-600 h-2 rounded-full transition-all" style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

// ─── Step Row ─────────────────────────────────────────────────────────────────
function StepRow({ step, onEdit, onDelete, onProgressUpdate, depth = 0 }: any) {
  const { t, locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const name = step.block?.translations?.[0]?.name || `Step #${step.id}`;

  return (
    <>
      <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
        <td className="py-3 px-4">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
            {step.children?.length > 0 && (
              <button onClick={() => setOpen(!open)} className="text-gray-400 hover:text-gray-700">
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            )}
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{name}</span>
          </div>
        </td>
        <td className="py-3 px-4"><StatusBadge status={step.status} /></td>
        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{step.priority}</td>
        <td className="py-3 px-4 w-32">
          <ProgressBar value={Number(step.progress)} />
          <span className="text-xs text-gray-500 mt-1">{Number(step.progress).toFixed(0)}%</span>
        </td>
        <td className="py-3 px-4 text-sm text-gray-500">
          {step.startDate ? new Date(step.startDate).toLocaleDateString(locale) : '—'}
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1">
            <button onClick={() => onProgressUpdate(step)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title={t('execution.updateProgress')}>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onEdit(step)} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(step.id)} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {open && step.children?.map((child: any) => (
        <StepRow key={child.id} step={child} onEdit={onEdit} onDelete={onDelete} onProgressUpdate={onProgressUpdate} depth={depth + 1} />
      ))}
    </>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, onSave, saving, children }: any) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-4">{children}</div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            {t('common.cancel')}
          </button>
          <button onClick={onSave} disabled={saving} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';
const SELECT = INPUT;

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ExecutionPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const role = user?.admin?.role || '';

  const [tab, setTab] = useState<Tab>('phases');
  const [phases, setPhases] = useState<any[]>([]);
  const [steps, setSteps] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal state
  const [modal, setModal] = useState<null | 'step' | 'phase' | 'task' | 'progress'>(null);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  const canEdit = role === 'administrator' || role === 'employee';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ph, st, tk] = await Promise.all([
        executionApi.listPhases(projectId),
        executionApi.listSteps(projectId),
        executionApi.listTasks(projectId),
      ]);
      setPhases(ph || []);
      setSteps(st || []);
      setTasks(tk || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = (type: 'step' | 'phase' | 'task') => {
    setEditing(null);
    setForm({});
    setModal(type);
  };

  const openEdit = (type: 'step' | 'phase' | 'task', item: any) => {
    setEditing(item);
    setForm({
      blockId: item.blockId,
      status: item.status,
      priority: item.priority,
      startDate: item.startDate?.split('T')[0],
      endDate: item.endDate?.split('T')[0],
      order: item.order,
      phaseId: item.phaseId,
      assignedToId: item.assignedToId,
      parentId: item.parentId,
    });
    setModal(type);
  };

  const openProgress = (step: any) => {
    setEditing(step);
    setForm({ progress: Number(step.progress) });
    setModal('progress');
  };

  const save = async () => {
    setSaving(true);
    try {
      if (modal === 'step') {
        if (editing) await executionApi.updateStep(projectId, editing.id, form);
        else await executionApi.createStep(projectId, form);
      } else if (modal === 'phase') {
        if (editing) await executionApi.updatePhase(projectId, editing.id, form);
        else await executionApi.createPhase(projectId, form);
      } else if (modal === 'task') {
        if (editing) await executionApi.updateTask(projectId, editing.id, form);
        else await executionApi.createTask(projectId, form);
      } else if (modal === 'progress') {
        await executionApi.updateStepProgress(projectId, editing.id, form.progress);
      }
      setModal(null);
      load();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (type: 'step' | 'phase' | 'task', id: number) => {
    if (!confirm(t('common.confirmAction'))) return;
    try {
      if (type === 'step') await executionApi.deleteStep(projectId, id);
      else if (type === 'phase') await executionApi.deletePhase(projectId, id);
      else await executionApi.deleteTask(projectId, id);
      load();
    } catch { /* ignore */ }
  };

  const STEP_STATUSES = ['pending', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled'];
  const PHASE_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];
  const TASK_STATUSES = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];

  const tabs: Tab[] = ['phases', 'steps', 'tasks'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('execution.title')}</h1>
        </div>
        {canEdit && (
          <button
            onClick={() => openCreate(tab === 'phases' ? 'phase' : tab === 'steps' ? 'step' : 'task')}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {t(`execution.add${tab === 'phases' ? 'Phase' : tab === 'steps' ? 'Step' : 'Task'}`)}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 flex gap-6">
        {tabs.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={cn(
              'pb-3 text-sm font-medium border-b-2 transition-colors capitalize',
              tab === tb
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {t(`execution.${tb}`)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
        ) : (
          <>
            {/* Phases Tab */}
            {tab === 'phases' && (
              phases.length === 0 ? (
                <p className="text-center py-12 text-gray-400">{t('execution.noPhases')}</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Name', t('execution.status'), 'Order', t('execution.progress'), t('execution.startDate'), ''].map((h, i) => (
                        <th key={i} className="text-start py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {phases.map((phase) => (
                      <tr key={phase.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 px-4 font-medium text-sm text-gray-900 dark:text-gray-100">
                          {phase.block?.translations?.[0]?.name || `Phase #${phase.id}`}
                        </td>
                        <td className="py-3 px-4"><StatusBadge status={phase.status} ns="phaseStatuses" /></td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{phase.order}</td>
                        <td className="py-3 px-4 w-32">
                          <ProgressBar value={Number(phase.progress)} />
                          <span className="text-xs text-gray-500">{Number(phase.progress).toFixed(0)}%</span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-500">
                          {phase.startDate ? new Date(phase.startDate).toLocaleDateString(locale) : '—'}
                        </td>
                        <td className="py-3 px-4">
                          {canEdit && (
                            <div className="flex gap-1">
                              <button onClick={() => openEdit('phase', phase)} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteItem('phase', phase.id)} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* Steps Tab */}
            {tab === 'steps' && (
              steps.length === 0 ? (
                <p className="text-center py-12 text-gray-400">{t('execution.noSteps')}</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Name', t('execution.status'), t('execution.priority'), t('execution.progress'), t('execution.startDate'), ''].map((h, i) => (
                        <th key={i} className="text-start py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((step) => (
                      <StepRow key={step.id} step={step} onEdit={(s: any) => openEdit('step', s)} onDelete={(sid: number) => deleteItem('step', sid)} onProgressUpdate={openProgress} />
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* Tasks Tab */}
            {tab === 'tasks' && (
              tasks.length === 0 ? (
                <p className="text-center py-12 text-gray-400">{t('execution.noTasks')}</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {['Name', 'Phase', t('execution.status'), t('execution.assignedTo'), t('execution.startDate'), ''].map((h, i) => (
                        <th key={i} className="text-start py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <tr key={task.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 px-4 font-medium text-sm text-gray-900 dark:text-gray-100">
                          {task.block?.translations?.[0]?.name || `Task #${task.id}`}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-500">
                          {task.phase?.block?.translations?.[0]?.name || '—'}
                        </td>
                        <td className="py-3 px-4"><StatusBadge status={task.status} ns="taskStatuses" /></td>
                        <td className="py-3 px-4 text-sm text-gray-500">
                          {task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-500">
                          {task.startDate ? new Date(task.startDate).toLocaleDateString(locale) : '—'}
                        </td>
                        <td className="py-3 px-4">
                          {canEdit && (
                            <div className="flex gap-1">
                              <button onClick={() => openEdit('task', task)} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteItem('task', task.id)} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </>
        )}
      </div>

      {/* Step Modal */}
      {modal === 'step' && (
        <Modal title={editing ? t('execution.editStep') : t('execution.addStep')} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <Field label="Block ID">
            <input type="number" value={form.blockId || ''} onChange={(e) => setForm({ ...form, blockId: Number(e.target.value) })} className={INPUT} placeholder="Block ID for content" />
          </Field>
          <Field label={t('execution.status')}>
            <select value={form.status || 'pending'} onChange={(e) => setForm({ ...form, status: e.target.value })} className={SELECT}>
              {STEP_STATUSES.map((s) => <option key={s} value={s}>{t(`execution.statuses.${s}`) || s}</option>)}
            </select>
          </Field>
          <Field label={t('execution.priority')}>
            <input type="number" min={0} value={form.priority ?? 0} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className={INPUT} />
          </Field>
          <Field label={t('execution.startDate')}>
            <input type="date" value={form.startDate || ''} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('execution.endDate')}>
            <input type="date" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('execution.parentStep')}>
            <select value={form.parentId || ''} onChange={(e) => setForm({ ...form, parentId: e.target.value ? Number(e.target.value) : undefined })} className={SELECT}>
              <option value="">{t('common.none')}</option>
              {steps.map((s) => <option key={s.id} value={s.id}>{s.block?.translations?.[0]?.name || `Step #${s.id}`}</option>)}
            </select>
          </Field>
        </Modal>
      )}

      {/* Phase Modal */}
      {modal === 'phase' && (
        <Modal title={editing ? t('execution.editPhase') : t('execution.addPhase')} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <Field label="Block ID">
            <input type="number" value={form.blockId || ''} onChange={(e) => setForm({ ...form, blockId: Number(e.target.value) })} className={INPUT} placeholder="Block ID for content" />
          </Field>
          <Field label={t('execution.status')}>
            <select value={form.status || 'pending'} onChange={(e) => setForm({ ...form, status: e.target.value })} className={SELECT}>
              {PHASE_STATUSES.map((s) => <option key={s} value={s}>{t(`execution.phaseStatuses.${s}`) || s}</option>)}
            </select>
          </Field>
          <Field label="Order">
            <input type="number" min={0} value={form.order ?? 0} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} className={INPUT} />
          </Field>
          <Field label={t('execution.startDate')}>
            <input type="date" value={form.startDate || ''} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('execution.endDate')}>
            <input type="date" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={INPUT} />
          </Field>
        </Modal>
      )}

      {/* Task Modal */}
      {modal === 'task' && (
        <Modal title={editing ? t('execution.editTask') : t('execution.addTask')} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <Field label="Block ID">
            <input type="number" value={form.blockId || ''} onChange={(e) => setForm({ ...form, blockId: Number(e.target.value) })} className={INPUT} placeholder="Block ID for content" />
          </Field>
          <Field label={t('execution.phase')}>
            <select value={form.phaseId || ''} onChange={(e) => setForm({ ...form, phaseId: e.target.value ? Number(e.target.value) : undefined })} className={SELECT}>
              <option value="">{t('common.none')}</option>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.block?.translations?.[0]?.name || `Phase #${p.id}`}</option>)}
            </select>
          </Field>
          <Field label={t('execution.status')}>
            <select value={form.status || 'pending'} onChange={(e) => setForm({ ...form, status: e.target.value })} className={SELECT}>
              {TASK_STATUSES.map((s) => <option key={s} value={s}>{t(`execution.taskStatuses.${s}`) || s}</option>)}
            </select>
          </Field>
          <Field label={t('execution.startDate')}>
            <input type="date" value={form.startDate || ''} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={INPUT} />
          </Field>
          <Field label={t('execution.endDate')}>
            <input type="date" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={INPUT} />
          </Field>
        </Modal>
      )}

      {/* Progress Modal */}
      {modal === 'progress' && (
        <Modal title={t('execution.updateProgress')} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <Field label={`${t('execution.progress')} (0-100)`}>
            <input type="number" min={0} max={100} value={form.progress ?? 0} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} className={INPUT} />
          </Field>
          <ProgressBar value={form.progress ?? 0} />
        </Modal>
      )}
    </div>
  );
}
