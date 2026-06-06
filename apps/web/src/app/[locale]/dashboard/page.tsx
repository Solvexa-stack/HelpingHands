'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Heart, User, Settings, QrCode, ArrowRight, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { donationsApi } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor, getTranslation } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/progress-bar';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace(`/${locale}/auth/login?redirect=/dashboard`);
  }, [user, loading, router, locale]);

  const { data: donationsData, isLoading: donationsLoading } = useQuery({
    queryKey: ['my-donations'],
    queryFn: () => donationsApi.list({ limit: 20 }),
    enabled: !!user,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return null;

  const donations = donationsData?.data || [];
  const name = user.participant?.firstName || user.admin?.firstName || '';
  const email = user.email || '';

  const statsCards = [
    {
      label: 'Total Donations',
      value: donations.length,
      icon: Heart,
      color: 'text-rose-500 bg-rose-50',
    },
    {
      label: 'Approved',
      value: donations.filter((d: any) => d.status === 'approved').length,
      icon: CheckCircle,
      color: 'text-green-500 bg-green-50',
    },
    {
      label: 'Pending',
      value: donations.filter((d: any) => d.status === 'pending').length,
      icon: Clock,
      color: 'text-yellow-500 bg-yellow-50',
    },
    {
      label: 'Total Contributed',
      value: formatCurrency(
        donations.filter((d: any) => d.status === 'approved').reduce((sum: number, d: any) => sum + Number(d.amount), 0),
      ),
      icon: ArrowRight,
      color: 'text-primary-500 bg-primary-50',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Welcome back, {name}! 👋</h1>
            <p className="text-gray-500 mt-1">{email}</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/${locale}/dashboard/profile`} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
              <User className="w-4 h-4" /> Profile
            </Link>
            <Link href={`/${locale}/projects`} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
              <Heart className="w-4 h-4" /> Donate
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statsCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card p-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-extrabold text-gray-900">{value}</p>
              <p className="text-gray-500 text-sm mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Donations */}
        <div className="card">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">My Donations</h2>
          </div>

          {donationsLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full mx-auto" />
            </div>
          ) : donations.length === 0 ? (
            <div className="p-12 text-center">
              <Heart className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">You haven't made any donations yet.</p>
              <Link href={`/${locale}/projects`} className="btn-primary text-sm py-2 px-5">
                Explore Projects
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {donations.map((donation: any) => {
                const translation = getTranslation(donation.project?.block?.translations || [], locale);
                return (
                  <div key={donation.id} className="p-5 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{translation?.name || 'Project'}</p>
                      <p className="text-sm text-gray-400 mt-0.5">{formatDate(donation.createdAt, locale)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{formatCurrency(Number(donation.amount))}</p>
                      <span className={`badge mt-1 ${getStatusColor(donation.status)}`}>
                        {donation.status}
                      </span>
                    </div>
                    {donation.status === 'pending' && (
                      <Link
                        href={`/${locale}/donations/${donation.qrToken}`}
                        className="flex-shrink-0 p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="View QR Code"
                      >
                        <QrCode className="w-5 h-5" />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
