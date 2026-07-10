'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Mail, Calendar, Heart, DollarSign, ToggleLeft, ToggleRight, User } from 'lucide-react';
import { participantsApi } from '@/lib/api';
import { formatCurrency, formatDate, getTranslation, STATUS_COLORS, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { useLanguage } from '@/contexts/language-context';

export default function ParticipantDetailPage({ params }: { params: { id: string } }) {
  const { locale } = useLanguage();
  const id = Number(params.id);
  const { success, error: toastError } = useToast();
  const qc = useQueryClient();

  const { data: participant, isLoading } = useQuery({
    queryKey: ['participant', id],
    queryFn: () => participantsApi.get(id),
  });

  const toggleMutation = useMutation({
    mutationFn: () => participantsApi.toggleActive(id),
    onSuccess: () => { success('Account status updated'); qc.invalidateQueries({ queryKey: ['participant', id] }); },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Failed'),
  });

  if (isLoading) return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;
  if (!participant) return <div className="py-20 text-center text-gray-400">Participant not found</div>;

  const isActive = participant.user?.isActive;
  const donations = participant.donations || [];
  const totalDonated = donations.filter((d: any) => d.status === 'approved').reduce((s: number, d: any) => s + Number(d.amount), 0);
  const fullName = `${participant.firstName} ${participant.lastName}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/participants" className="btn-ghost btn-sm p-1.5 rounded-lg"><ArrowLeft className="w-4 h-4" /></Link>
          <h1 className="page-title">Participant Profile</h1>
        </div>
        <button onClick={() => toggleMutation.mutate()} disabled={toggleMutation.isPending}
          className={cn('btn btn-md gap-2', isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100')}>
          {isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {isActive ? 'Deactivate Account' : 'Activate Account'}
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left — profile + donations */}
        <div className="lg:col-span-2 space-y-6">

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Heart, label: 'Total Donations', value: String(participant._count?.donations ?? 0), color: 'text-rose-600 bg-rose-50' },
              { icon: DollarSign, label: 'Total Donated', value: formatCurrency(totalDonated, undefined, locale), color: 'text-emerald-600 bg-emerald-50' },
              { icon: Heart, label: 'Pending', value: String(donations.filter((d: any) => d.status === 'pending').length), color: 'text-yellow-600 bg-yellow-50' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="card p-4 space-y-2">
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Donations table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Donation History</h2>
            </div>
            {donations.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-sm">No donations yet</p>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">Project</th>
                    <th className="table-header">Amount</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {donations.map((d: any) => {
                    const projectName = getTranslation(d.project?.block?.translations || [])?.name || '—';
                    return (
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell max-w-48">
                          <p className="truncate font-medium">{projectName}</p>
                        </td>
                        <td className="table-cell font-semibold">{formatCurrency(Number(d.amount), undefined, locale)}</td>
                        <td className="table-cell">
                          <span className={cn('badge', STATUS_COLORS[d.status])}>{d.status}</span>
                        </td>
                        <td className="table-cell text-gray-400">{formatDate(d.createdAt, locale)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right — info card */}
        <div className="space-y-5">
          {/* Avatar + name */}
          <div className="card p-6 text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center mx-auto text-primary-700 text-2xl font-bold overflow-hidden">
              {participant.user?.avatar
                ? <img src={participant.user.avatar} alt={fullName} className="w-full h-full object-cover" />
                : <>{participant.firstName?.[0]}{participant.lastName?.[0]}</>
              }
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg">{fullName}</p>
              <span className={cn('badge mt-1', isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          {/* Contact & info */}
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Information</h3>
            {[
              { icon: Mail, label: 'Email', value: participant.user?.email || '—' },
              { icon: User, label: 'Representation', value: participant.representation || '—' },
              { icon: Calendar, label: 'Joined', value: participant.user?.joiningDate ? formatDate(participant.user.joiningDate, locale) : '—' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-medium text-gray-900 break-all">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
