'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft, Settings2, CheckCircle, Clock, MapPin, FileText,
  Users, Pencil, AlertTriangle, ChevronRight, Vote, ExternalLink,
  ThumbsUp, ThumbsDown, RotateCcw, XCircle, Timer,
} from 'lucide-react';
import { studiesApi, projectsApi, adminsApi, votingApi, organizationsApi } from '@/lib/api';
import { formatDate, getTranslation, cn } from '@/lib/utils';
import { StudyStatusBadge } from '@/components/study/study-status-badge';
import { ChangeStudyStatusModal } from '@/components/study/change-study-status-modal';
import { CountdownTimer } from '@/components/voting/countdown-timer';
import { VoteResultsChart } from '@/components/voting/vote-results-chart';
import { useToast } from '@/components/ui/toaster';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';

const SECTION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  in_progress: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  completed: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  needs_revision: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
};

function SectionStatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  return (
    <span className={cn('badge text-xs', SECTION_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600')}>
      {t(`studies.sectionStatus.${status}`) || status.replace(/_/g, ' ')}
    </span>
  );
}

function TimelineEvent({ label, date }: { label: string; date?: string | null }) {
  const { locale } = useLanguage();
  const done = !!date;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn('w-3 h-3 rounded-full mt-0.5 flex-shrink-0', done ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700')} />
        <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />
      </div>
      <div className="pb-4">
        <p className={cn('text-sm font-medium', done ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600')}>{label}</p>
        {date && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(date, locale)}</p>}
      </div>
    </div>
  );
}

// ─── Reject reason modal ──────────────────────────────────────────────────────
function RejectModal({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void;
  onSubmit: (reason: string) => void;
  loading: boolean;
}) {
  const { t } = useLanguage();
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{t('studies.rejectModal.title')}</h2>
        <p className="text-sm text-gray-500">{t('studies.rejectModal.description')}</p>
        <textarea
          className="input w-full h-28 resize-none text-sm"
          placeholder={t('studies.rejectModal.placeholder')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost btn-md" disabled={loading}>{t('common.cancel')}</button>
          <button
            onClick={() => reason.trim() && onSubmit(reason.trim())}
            disabled={!reason.trim() || loading}
            className="btn-primary btn-md"
          >
            {loading ? t('studies.rejectModal.rejecting') : t('studies.rejectModal.reject')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Extend deadline modal ────────────────────────────────────────────────────
function ExtendDeadlineModal({
  currentEnd,
  onClose,
  onSubmit,
  loading,
}: {
  currentEnd: string;
  onClose: () => void;
  onSubmit: (newEnd: string) => void;
  loading: boolean;
}) {
  const { t } = useLanguage();
  const minDate = new Date(Math.max(Date.now() + 3600_000, new Date(currentEnd).getTime() + 3600_000));
  const [value, setValue] = useState(minDate.toISOString().slice(0, 16));
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{t('studies.extendModal.title')}</h2>
        <label className="block text-sm text-gray-600">
          {t('studies.extendModal.newEndDate')}
          <input
            type="datetime-local"
            className="input w-full mt-1"
            value={value}
            min={minDate.toISOString().slice(0, 16)}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost btn-md" disabled={loading}>{t('common.cancel')}</button>
          <button
            onClick={() => onSubmit(new Date(value).toISOString())}
            disabled={loading}
            className="btn-primary btn-md"
          >
            {loading ? t('studies.extendModal.saving') : t('studies.extendModal.extend')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChoiceBadge({ choice }: { choice: string }) {
  const { t } = useLanguage();
  const map: Record<string, string> = {
    for: 'bg-green-100 text-green-700',
    against: 'bg-red-100 text-red-700',
    abstain: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={cn('badge text-xs flex-shrink-0', map[choice] ?? 'bg-gray-100 text-gray-600')}>
      {t(`studies.choices.${choice}`) || choice}
    </span>
  );
}

// ─── Voting tab ───────────────────────────────────────────────────────────────
function VotingTab({ study, isAdmin, onStatusChange, statusLoading }: {
  study: any;
  isAdmin: boolean;
  onStatusChange: (status: string, extraData?: Record<string, any>) => void;
  statusLoading: boolean;
}) {
  const { t, locale } = useLanguage();
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 16));
  const minEndDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16);
  const [endDate, setEndDate] = useState(minEndDate);
  const [rejectModal, setRejectModal] = useState(false);
  const [extendModal, setExtendModal] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const votingStatuses = ['voting_open', 'voting_closed', 'approved', 'rejected'];
  const { data: resultsData, refetch: refetchResults } = useQuery({
    queryKey: ['voting-results', study.id],
    queryFn: () => votingApi.getResults(study.id),
    enabled: votingStatuses.includes(study.status),
  });

  useEffect(() => {
    if (study.status === 'voting_open') {
      intervalRef.current = setInterval(() => {
        refetchResults();
      }, 30_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [study.status, refetchResults]);

  const results = resultsData
    ? {
        for: resultsData.for?.count ?? 0,
        against: resultsData.against?.count ?? 0,
        abstain: resultsData.abstain?.count ?? 0,
        total: resultsData.total ?? 0,
      }
    : { for: 0, against: 0, abstain: 0, total: 0 };
  const comments = resultsData?.recentComments ?? [];
  const forPct = results.total > 0 ? ((results.for / results.total) * 100).toFixed(1) : '0';

  // ── draft / in_review ──
  if (['draft', 'in_review'].includes(study.status)) {
    return (
      <div className="card p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Vote className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 font-medium">
            {t('studies.votingTab.waitingPublish')}
          </p>
        </div>
      </div>
    );
  }

  // ── published ──
  if (study.status === 'published') {
    const isEndValid = endDate && new Date(endDate) >= new Date(Date.now() + 24 * 3600 * 1000);
    return (
      <div className="card p-6 space-y-5">
        <h3 className="font-semibold text-gray-900">{t('studies.votingTab.configureTitle')}</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm text-gray-600">
            {t('studies.votingTab.startDate')}
            <input
              type="datetime-local"
              className="input w-full mt-1"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="block text-sm text-gray-600">
            {t('studies.votingTab.endDate')} <span className="text-red-500">*</span>
            <input
              type="datetime-local"
              className="input w-full mt-1"
              value={endDate}
              min={minEndDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            {!isEndValid && endDate && (
              <p className="text-xs text-red-500 mt-1">{t('studies.votingTab.endDateHint')}</p>
            )}
          </label>
        </div>
        <button
          onClick={() =>
            onStatusChange('voting_open', {
              votingStartsAt: new Date(startDate).toISOString(),
              votingEndsAt: new Date(endDate).toISOString(),
            })
          }
          disabled={!isEndValid || statusLoading}
          className="btn-primary btn-md"
        >
          {statusLoading ? t('studies.votingTab.opening') : t('studies.votingTab.openVoting')}
        </button>
      </div>
    );
  }

  // ── voting_open ──
  if (study.status === 'voting_open') {
    return (
      <div className="space-y-5">
        <div className="card p-5 space-y-4">
          {study.votingEndsAt && (
            <CountdownTimer endsAt={new Date(study.votingEndsAt)} />
          )}
          <hr className="border-gray-100" />
          <VoteResultsChart results={results} />
          <hr className="border-gray-100" />
          {isAdmin && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => onStatusChange('voting_closed')}
                disabled={statusLoading}
                className="btn-secondary btn-md text-red-600 hover:bg-red-50 border-red-200"
              >
                {t('studies.votingTab.closeVotingEarly')}
              </button>
              <button
                onClick={() => setExtendModal(true)}
                className="btn-secondary btn-md"
                disabled={statusLoading}
              >
                <Timer className="w-4 h-4" />
                {t('studies.votingTab.extendDeadline')}
              </button>
            </div>
          )}
        </div>

        {comments.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">{t('studies.votingTab.recentComments')}</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {comments.map((c: any, i: number) => (
                <div key={i} className="px-5 py-3 flex items-start gap-3">
                  <ChoiceBadge choice={c.choice} />
                  <p className="text-sm text-gray-600 flex-1 line-clamp-2">{c.comment}</p>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(c.createdAt, locale)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="text-end">
            <Link
              href={`/studies/${study.id}/votes`}
              className="text-sm text-primary-600 hover:underline flex items-center gap-1 justify-end"
            >
              {t('studies.votingTab.viewAuditLog')} <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {extendModal && (
          <ExtendDeadlineModal
            currentEnd={study.votingEndsAt}
            onClose={() => setExtendModal(false)}
            onSubmit={(newEnd) => {
              onStatusChange('voting_open', { votingEndsAt: newEnd });
              setExtendModal(false);
            }}
            loading={statusLoading}
          />
        )}
      </div>
    );
  }

  // ── voting_closed ──
  if (study.status === 'voting_closed') {
    return (
      <div className="space-y-5">
        <div className="card p-5 space-y-4">
          <p className="text-sm font-medium text-gray-600">{t('studies.votingTab.ended')}</p>
          <VoteResultsChart results={results} />
          {results.total > 0 && (
            <p className="text-sm font-semibold text-gray-800">
              {t('studies.votingTab.result')} <span className="text-green-700">{forPct}{t('studies.votingTab.inFavour')}</span>
            </p>
          )}
        </div>

        {isAdmin && (
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">{t('studies.votingTab.finalDecision')}</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => onStatusChange('approved')}
                disabled={statusLoading}
                className="btn-primary btn-md bg-green-600 hover:bg-green-700 border-green-600"
              >
                <ThumbsUp className="w-4 h-4" />
                {t('studies.votingTab.approveStudy')}
              </button>
              <button
                onClick={() => onStatusChange('in_review')}
                disabled={statusLoading}
                className="btn-secondary btn-md"
              >
                <RotateCcw className="w-4 h-4" />
                {t('studies.votingTab.requestRevision')}
              </button>
              <button
                onClick={() => setRejectModal(true)}
                disabled={statusLoading}
                className="btn-secondary btn-md text-red-600 hover:bg-red-50 border-red-200"
              >
                <XCircle className="w-4 h-4" />
                {t('studies.votingTab.rejectStudy')}
              </button>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="text-end">
            <Link
              href={`/studies/${study.id}/votes`}
              className="text-sm text-primary-600 hover:underline flex items-center gap-1 justify-end"
            >
              {t('studies.votingTab.viewAuditLog')} <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {rejectModal && (
          <RejectModal
            onClose={() => setRejectModal(false)}
            onSubmit={(reason) => {
              onStatusChange('rejected', { rejectionReason: reason });
              setRejectModal(false);
            }}
            loading={statusLoading}
          />
        )}
      </div>
    );
  }

  // ── approved / rejected ──
  if (['approved', 'rejected'].includes(study.status)) {
    const isApproved = study.status === 'approved';
    return (
      <div className="space-y-5">
        <div className={cn(
          'card p-5 border-2',
          isApproved ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
        )}>
          <div className="flex items-start gap-3">
            {isApproved
              ? <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              : <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
            <div className="space-y-1">
              <p className={cn('font-semibold', isApproved ? 'text-green-800' : 'text-red-800')}>
                {isApproved ? t('studies.votingTab.studyApproved') : t('studies.votingTab.studyRejected')}
              </p>
              {isApproved && study.approvedAt && (
                <p className="text-xs text-green-700">
                  {formatDate(study.approvedAt, locale)}
                  {study.approvedBy && ` · ${t('studies.by')} ${study.approvedBy.firstName} ${study.approvedBy.lastName}`}
                </p>
              )}
              {!isApproved && study.updatedAt && (
                <p className="text-xs text-red-700">{formatDate(study.updatedAt, locale)}</p>
              )}
              {study.rejectionReason && (
                <p className="text-sm text-red-700 mt-2 bg-red-100 rounded-lg p-2">
                  {study.rejectionReason}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-gray-900 text-sm">{t('studies.votingTab.finalVoteResults')}</h3>
          <VoteResultsChart results={results} />
          {results.total > 0 && (
            <p className="text-sm font-semibold text-gray-800">
              {t('studies.votingTab.result')} <span className="text-green-700">{forPct}{t('studies.votingTab.inFavour')}</span>
            </p>
          )}
        </div>

        {isAdmin && (
          <div className="text-end">
            <Link
              href={`/studies/${study.id}/votes`}
              className="text-sm text-primary-600 hover:underline flex items-center gap-1 justify-end"
            >
              {t('studies.votingTab.viewAuditLog')} <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StudyDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const { user, activeOrg, workspaceType } = useAuth();
  const { t, locale } = useLanguage();

  const secName = (sec: any) =>
    (locale === 'ar' && sec.nameAr) ? sec.nameAr :
    (locale === 'fr' && sec.nameFr) ? sec.nameFr :
    sec.name;

  const secDesc = (sec: any) =>
    (locale === 'ar' && sec.descriptionAr) ? sec.descriptionAr :
    (locale === 'fr' && sec.descriptionFr) ? sec.descriptionFr :
    sec.description;
  const role = user?.admin?.role || '';
  const isAdmin = role === 'administrator';
  // Org-workspace tenancy only surfaces the org's own studies, so org_admin
  // of the active org has full control here
  const isOrgAdmin = workspaceType === 'organization' && (activeOrg?.roles?.includes('org_admin') ?? false);
  const isReadOnly = role === 'financial_officer';
  const [statusModal, setStatusModal] = useState(false);
  const [approvalBanner, setApprovalBanner] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'voting'>('overview');

  const { data: study, isLoading } = useQuery({
    queryKey: ['study', id],
    queryFn: () => studiesApi.get(id),
  });

  const { data: project } = useQuery({
    queryKey: ['project', study?.projectId],
    queryFn: () => projectsApi.get(study!.projectId),
    enabled: !!study?.projectId,
  });

  // GET /admins is administrator-only; employees would just 403
  const { data: adminsData } = useQuery({
    queryKey: ['admins-list'],
    queryFn: () => adminsApi.list({ limit: 100 }),
    enabled: isAdmin,
  });

  // Org admins assign from their own team instead of the platform admins list
  const { data: orgMembers } = useQuery({
    queryKey: ['org-members', activeOrg?.id],
    queryFn: () => organizationsApi.members(activeOrg!.id),
    enabled: isOrgAdmin && !!activeOrg,
  });

  const admins = isOrgAdmin
    ? (orgMembers || []).filter((m: any) => m.admin).map((m: any) => m.admin)
    : (adminsData || []);

  const changeStatusMutation = useMutation({
    mutationFn: ({ status, extraData }: { status: string; extraData?: Record<string, any> }) =>
      studiesApi.changeStatus(id, status, extraData?.rejectionReason, extraData),
    onSuccess: (_, vars) => {
      success(t('studies.statusUpdated'));
      if (vars.status === 'approved') setApprovalBanner(true);
      qc.invalidateQueries({ queryKey: ['study', id] });
      qc.invalidateQueries({ queryKey: ['admin-studies'] });
      qc.invalidateQueries({ queryKey: ['voting-results', id] });
      setStatusModal(false);
    },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Status change failed'),
  });

  const assignMutation = useMutation({
    mutationFn: ({ sectionId, adminId }: { sectionId: number; adminId: number }) =>
      studiesApi.updateSection(sectionId, { assignedTo: adminId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study', id] });
    },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Assignment failed'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">{t('common.loading')}</div>;
  }
  if (!study) {
    return <div className="py-20 text-center text-gray-400">{t('studies.notFound')}</div>;
  }

  const projectName = getTranslation(project?.block?.translations || [])?.name || `Project #${study.projectId}`;

  const sections = study.sections || [];
  const completedSections = sections.filter((s: any) => s.status === 'completed').length;
  const requiredSections = sections.filter((s: any) => s.isRequired).length;
  const completedRequired = sections.filter((s: any) => s.isRequired && s.status === 'completed').length;
  const allRequiredDone = requiredSections > 0 && completedRequired === requiredSections;

  return (
    <div className="space-y-6">
      {/* Approval banner */}
      {approvalBanner && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800">{t('studies.approvalBanner')}</p>
            <button onClick={() => setApprovalBanner(false)} className="text-xs text-green-600 underline mt-0.5">{t('studies.dismiss')}</button>
          </div>
        </div>
      )}

      {/* All-required-done banner */}
      {allRequiredDone && study.status === 'draft' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 font-medium">
            {t('studies.allRequiredDone')}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/studies" className="btn-ghost btn-sm p-1.5 rounded-lg">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="page-title">{projectName}</h1>
              <StudyStatusBadge status={study.status} size="lg" />
            </div>
            {project?.location && (
              <p className="text-sm text-gray-400 flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5" />{project.location}
              </p>
            )}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setStatusModal(true)}
            className="btn-secondary btn-md gap-2 flex-shrink-0"
          >
            <Settings2 className="w-4 h-4" />
            {t('studies.changeStatus')}
          </button>
        )}
      </div>

      {/* W3-E4-S3: Board rationale — visible to the owning org when the
          latest decision requested changes */}
      {(() => {
        const latest = (study.decisions ?? [])[((study.decisions ?? []).length || 1) - 1];
        if (!latest || latest.decision !== 'changes_requested' || !['draft', 'in_review'].includes(study.status)) return null;
        return (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-yellow-800">The Board requested changes</p>
            <p className="text-sm text-yellow-700 mt-1">{latest.rationale}</p>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'overview'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-800',
          )}
        >
          {t('studies.overview')}
        </button>
        <button
          onClick={() => setActiveTab('voting')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
            activeTab === 'voting'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-800',
          )}
        >
          <Vote className="w-3.5 h-3.5" />
          {t('studies.voting')}
        </button>
      </div>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Summary */}
            <div className="card p-5 space-y-3">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t('studies.summary')}</h2>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {study.summary || <span className="text-gray-400 dark:text-gray-500 italic">{t('studies.noSummary')}</span>}
              </p>
              {(study.votingStartsAt || study.votingEndsAt) && (
                <div className="flex gap-6 pt-2 text-sm border-t border-gray-100 dark:border-gray-800">
                  {study.votingStartsAt && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('studies.votingStarts')}</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(study.votingStartsAt, locale)}</p>
                    </div>
                  )}
                  {study.votingEndsAt && (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('studies.votingEnds')}</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(study.votingEndsAt, locale)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sections */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                  {t('studies.sectionsTitle')}
                  <span className="ms-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                    ({completedSections}/{sections.length} {t('studies.completed')})
                  </span>
                </h2>
                {sections.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-primary-600 rounded-full transition-all"
                        style={{ width: `${sections.length ? (completedSections / sections.length) * 100 : 0}%` }}
                      />
                    </div>
                    <span>{sections.length > 0 ? Math.round((completedSections / sections.length) * 100) : 0}%</span>
                  </div>
                )}
              </div>

              {sections.length === 0 ? (
                <p className="text-center py-10 text-gray-500 dark:text-gray-400 text-sm">{t('studies.noSections')}</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {sections.map((sec: any) => (
                    <div key={sec.id} className="px-5 py-4 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{secName(sec)}</p>
                            {sec.isRequired && (
                              <span className="badge bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs">{t('studies.required')}</span>
                            )}
                            <SectionStatusBadge status={sec.status} />
                          </div>
                          {secDesc(sec) && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-1">{secDesc(sec)}</p>
                          )}
                          {sec.content && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{sec.content.slice(0, 100)}{sec.content.length > 100 ? '…' : ''}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {sec.files?.length ?? 0} {(sec.files?.length ?? 0) !== 1 ? t('studies.files_') : t('studies.file')}
                            </span>
                            {sec.assignedAdmin && (
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {sec.assignedAdmin.firstName} {sec.assignedAdmin.lastName}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!isReadOnly && admins.length > 0 && (
                            <select
                              value={sec.assignedTo ?? ''}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                if (val) assignMutation.mutate({ sectionId: sec.id, adminId: val });
                              }}
                              className="input input-sm text-xs py-1 h-7 w-36"
                              title={t('studies.unassigned')}
                            >
                              <option value="">{t('studies.unassigned')}</option>
                              {admins.map((a: any) => (
                                <option key={a.id} value={a.id}>
                                  {a.firstName} {a.lastName}
                                </option>
                              ))}
                            </select>
                          )}
                          {!isReadOnly && (
                            <Link
                              href={`/studies/${id}/sections/${sec.id}`}
                              className="btn btn-sm bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/60 p-1.5 rounded-lg"
                              title={t('common.edit')}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('studies.details')}</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('studies.colCategory')}</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">{project?.category || '—'}</span>
                </div>
                {study.rejectionReason && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block mb-1">{t('studies.rejectionReason')}</span>
                    <p className="text-red-600 dark:text-red-400 text-xs bg-red-50 dark:bg-red-950/40 rounded-lg p-2">{study.rejectionReason}</p>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('studies.createdBy')}</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{study.createdBy?.firstName} {study.createdBy?.lastName}</span>
                </div>
                {study.approvedBy && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('studies.approvedBy')}</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{study.approvedBy?.firstName} {study.approvedBy?.lastName}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('studies.timeline')}</h3>
              <div className="space-y-0">
                <TimelineEvent label={t('studies.timelineDraft')} date={study.createdAt} />
                <TimelineEvent label={t('studies.timelineSubmitted')} date={study.status !== 'draft' ? study.createdAt : null} />
                <TimelineEvent label={t('studies.timelinePublished')} date={study.publishedAt} />
                <TimelineEvent label={t('studies.timelineVotingOpened')} date={study.votingStartsAt} />
                <TimelineEvent label={t('studies.timelineVotingClosed')} date={study.votingEndsAt && ['voting_closed', 'approved', 'rejected'].includes(study.status) ? study.votingEndsAt : null} />
                {study.status === 'approved' && <TimelineEvent label={t('studies.timelineApproved')} date={study.approvedAt} />}
                {study.status === 'rejected' && <TimelineEvent label={t('studies.timelineRejected')} date={study.updatedAt} />}
              </div>
            </div>

            <Link
              href={`/projects/${study.projectId}`}
              className="card p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group"
            >
              <span className="text-sm font-medium text-gray-700">{t('studies.viewProject')}</span>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary-600 transition-colors" />
            </Link>
          </div>
        </div>
      )}

      {/* ── Voting tab ── */}
      {activeTab === 'voting' && (
        <VotingTab
          study={study}
          isAdmin={isAdmin}
          onStatusChange={(status, extraData) =>
            changeStatusMutation.mutate({ status, extraData })
          }
          statusLoading={changeStatusMutation.isPending}
        />
      )}

      {/* Change status modal */}
      {statusModal && (
        <ChangeStudyStatusModal
          study={study}
          onClose={() => setStatusModal(false)}
          onSubmit={(status, reason) => changeStatusMutation.mutate({ status, extraData: reason ? { rejectionReason: reason } : undefined })}
          loading={changeStatusMutation.isPending}
        />
      )}
    </div>
  );
}
