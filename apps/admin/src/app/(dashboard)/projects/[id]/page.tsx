'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft, Pencil, MapPin, Calendar, DollarSign,
  TrendingUp, Users, CheckCircle, Clock, XCircle,
  Settings2, Wallet, Flag, ChevronRight,
} from 'lucide-react';
import { projectsApi, donationsApi } from '@/lib/api';
import { formatCurrency, formatDate, getTranslation, STATUS_COLORS, cn } from '@/lib/utils';
import { WorkflowTimeline } from '@/components/workflow/workflow-timeline';
import { ParticipationsPanel } from '@/components/projects/participations-panel';
import { useLanguage } from '@/contexts/language-context';

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { locale } = useLanguage();
  const id = Number(params.id);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id),
  });

  const { data: donationsData } = useQuery({
    queryKey: ['project-donations', id],
    queryFn: () => donationsApi.list({ projectId: id, limit: 50 }),
    enabled: !!project,
  });

  if (isLoading) return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;
  if (!project) return <div className="py-20 text-center text-gray-400">Project not found</div>;

  const name = getTranslation(project.block?.translations || [])?.name || 'Unnamed';
  const brief = getTranslation(project.block?.translations || [])?.brief || '';
  const coverImage = project.block?.files?.find((f: any) => f.isCover)?.url || project.block?.imageUrl;
  const progression = Number(project.progression ?? 0);
  const collected = Number(project.collectedAmount ?? 0);
  const target = Number(project.value ?? 0);
  const donations = donationsData?.data || [];

  const statusCount = donations.reduce((acc: any, d: any) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/projects" className="btn-ghost btn-sm p-1.5 rounded-lg"><ArrowLeft className="w-4 h-4" /></Link>
          <div>
            <h1 className="page-title">{name}</h1>
            {brief && <p className="text-sm text-gray-500 mt-0.5">{brief}</p>}
          </div>
        </div>
        <Link href={`/projects/${id}/edit`} className="btn-primary btn-md gap-2">
          <Pencil className="w-4 h-4" /> Edit Project
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left — info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cover image */}
          {coverImage && (
            <div className="card overflow-hidden">
              <img src={coverImage.startsWith('http') ? coverImage : `http://localhost:4000${coverImage}`}
                alt={name} className="w-full h-56 object-cover" />
            </div>
          )}

          {/* Progress */}
          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Funding Progress</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Collected</span>
                <span className="font-bold text-primary-600">{formatCurrency(collected, undefined, locale)} / {formatCurrency(target, undefined, locale)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div className="h-full bg-primary-600 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(progression, 100)}%` }} />
              </div>
              <p className="text-end text-sm font-semibold text-gray-700">{progression.toFixed(1)}% funded</p>
            </div>

            {/* Mini stats */}
            <div className="grid grid-cols-3 gap-4 pt-2">
              {[
                { icon: CheckCircle, label: 'Approved', value: statusCount['approved'] || 0, color: 'text-green-600 bg-green-50' },
                { icon: Clock, label: 'Pending', value: statusCount['pending'] || 0, color: 'text-yellow-600 bg-yellow-50' },
                { icon: XCircle, label: 'Rejected', value: statusCount['rejected'] || 0, color: 'text-red-600 bg-red-50' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="text-center p-3 bg-gray-50 rounded-xl">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-1', color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Donations table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Donations ({donations.length})</h2>
            </div>
            {donations.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-sm">No donations yet</p>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">Participant</th>
                    <th className="table-header">Amount</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {donations.map((d: any) => (
                    <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <p className="font-medium">{d.participant?.firstName} {d.participant?.lastName}</p>
                        <p className="text-xs text-gray-400">{d.participant?.user?.email}</p>
                      </td>
                      <td className="table-cell font-semibold">{formatCurrency(Number(d.amount), undefined, locale)}</td>
                      <td className="table-cell">
                        <span className={cn('badge', STATUS_COLORS[d.status])}>{d.status}</span>
                      </td>
                      <td className="table-cell text-gray-400">{formatDate(d.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right — sidebar */}
        <div className="space-y-5">
          {/* Status badge */}
          <div className="card p-5">
            <span className={cn('badge text-sm px-3 py-1', project.isCompleted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>
              {project.isCompleted ? 'Completed' : 'Active'}
            </span>
          </div>

          {/* Details */}
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Details</h3>
            {[
              { icon: TrendingUp, label: 'Category', value: project.categoryNode?.name ?? project.category ?? '—' },
              { icon: DollarSign, label: 'Target', value: formatCurrency(target, undefined, locale) },
              { icon: MapPin, label: 'Location', value: project.location || '—' },
              { icon: Calendar, label: 'Start Date', value: project.expectedStartDate ? formatDate(project.expectedStartDate, locale) : '—' },
              { icon: Calendar, label: 'Completion', value: project.dateOfCompletion ? formatDate(project.dateOfCompletion, locale) : '—' },
              { icon: Users, label: 'Donations', value: String(project._count?.donations ?? 0) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-medium text-gray-900 capitalize">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Project Management Links */}
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Project Management</h3>
            {[
              { href: `/projects/${id}/execution`, icon: Settings2, label: 'Execution', desc: 'Phases, Steps & Tasks', color: 'bg-blue-100 text-blue-600' },
              { href: `/projects/${id}/financial`, icon: Wallet, label: 'Financial', desc: 'Budgets, Expenses & Ledger', color: 'bg-green-100 text-green-600' },
              { href: `/projects/${id}/milestones`, icon: Flag, label: 'Milestones', desc: 'Project Timeline', color: 'bg-purple-100 text-purple-600' },
            ].map(({ href, icon: Icon, label, desc, color }) => (
              <Link key={href} href={href} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 border border-gray-100 hover:border-gray-200 transition-all group">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-400 truncate">{desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
              </Link>
            ))}
          </div>

          {/* W6-E5: joint projects — participations + project-scope grants */}
          <ParticipationsPanel projectId={id} />

          {/* W4: engine lifecycle — state, timeline, availableTransitions */}
          <WorkflowTimeline projectId={Number(id)} studyId={project.studyId ?? null} />

          {/* Financial Officer */}
          {project.financialOfficer && (
            <div className="card p-5 space-y-3">
              <h3 className="font-semibold text-gray-900">Financial Officer</h3>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold text-sm">
                  {project.financialOfficer.firstName?.[0]}{project.financialOfficer.lastName?.[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {project.financialOfficer.firstName} {project.financialOfficer.lastName}
                  </p>
                  <p className="text-xs text-gray-400">Financial Officer</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
