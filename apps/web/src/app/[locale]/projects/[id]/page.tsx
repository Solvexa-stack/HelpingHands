import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MapPin, Calendar, Target, CheckCircle, BookOpen } from 'lucide-react';
import { projectsApi, studyApi } from '@/lib/api';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ProjectDonateSidebar } from '@/components/projects/project-donate-sidebar';
import { ProjectTransparency } from '@/components/projects/project-transparency';
import { getTranslation, formatCurrency, formatDate } from '@/lib/utils';
import type { Metadata } from 'next';

interface Props { params: { locale: string; id: string } }

export async function generateMetadata({ params: { locale, id } }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'projects' });
  try {
    const project = await projectsApi.get(Number(id), locale);
    const translation = getTranslation(project?.block?.translations || [], locale);
    return { title: translation?.name || t('projectFallback') };
  } catch { return { title: t('projectFallback') }; }
}

export const revalidate = 30;

export default async function ProjectDetailPage({ params: { locale, id } }: Props) {
  const t = await getTranslations({ locale, namespace: 'projects' });

  let project: any;
  try {
    project = await projectsApi.get(Number(id), locale);
  } catch { notFound(); }

  // Fetch study status for banner (best-effort — non-blocking)
  let studyStatus: string | null = project.studyStatus ?? null;
  if (!studyStatus) {
    try {
      const study = await studyApi.getByProject(Number(id));
      studyStatus = study?.status ?? null;
    } catch { /* no study yet */ }
  }

  const translation = getTranslation(project.block?.translations || [], locale);
  const coverFile = project.block?.files?.find((f: any) => f.isCover) || project.block?.files?.[0];
  const galleryFiles = project.block?.files?.filter((f: any) => !f.isCover && f.fileType === 'image') || [];
  const progression = Number(project.progression || 0);
  const hasStudy = !!studyStatus && ['published', 'voting_open', 'voting_closed', 'approved', 'rejected'].includes(studyStatus);

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container max-w-6xl">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-gray-500">
          <Link href={`/${locale}`} className="hover:text-primary-600">{t('home')}</Link>
          <span className="mx-2">/</span>
          <Link href={`/${locale}/projects`} className="hover:text-primary-600">{t('title')}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{translation?.name}</span>
        </nav>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Cover */}
            <div className="card overflow-hidden">
              <div className="relative h-80 bg-gray-100">
                {coverFile?.url ? (
                  <Image src={coverFile.url} alt={translation?.name || ''} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
                    <Target className="w-16 h-16 text-primary-400" />
                  </div>
                )}
                {project.isCompleted && (
                  <div className="absolute top-4 end-4 flex items-center gap-1.5 bg-green-500 text-white px-3 py-1.5 rounded-full text-sm font-semibold">
                    <CheckCircle className="w-4 h-4" />
                    {t('filters.completed')}
                  </div>
                )}
              </div>

              <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h1 className="text-2xl font-extrabold text-gray-900">{translation?.name}</h1>
                  {/* W6-E2: locale-aware civic category label (legacy enum as fallback) */}
                  <span className="badge bg-primary-50 text-primary-700 capitalize whitespace-nowrap">
                    {(locale === 'ar' && project.categoryNode?.nameAr) ||
                      (locale === 'fr' && project.categoryNode?.nameFr) ||
                      project.categoryNode?.name ||
                      project.category}
                  </span>
                </div>

                {/* W6-E5-S2: participating organizations (joint projects, additive) */}
                {(project.participations ?? []).filter((p: any) => p.status === 'active').length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-4 text-sm text-gray-600">
                    <span className="text-gray-400">{t('implementedWith')}</span>
                    {project.participations
                      .filter((p: any) => p.status === 'active')
                      .map((p: any) => (
                        <span key={p.id} className="badge bg-emerald-50 text-emerald-700 whitespace-nowrap">
                          {p.organization?.name}
                          <span className="text-emerald-400 ms-1">· {String(p.role).replace(/_/g, ' ')}</span>
                        </span>
                      ))}
                  </div>
                )}

                {translation?.brief && (
                  <p className="text-gray-600 text-lg mb-4 leading-relaxed">{translation.brief}</p>
                )}

                <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-6">
                  {project.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" /> {project.location}
                    </span>
                  )}
                  {project.expectedStartDate && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" /> {t('startsOn', { date: formatDate(project.expectedStartDate, locale) })}
                    </span>
                  )}
                </div>

                <ProgressBar value={progression} size="lg" showLabel />

                <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-4 pt-4 border-t border-gray-100">
                  <div className="text-center">
                    <p className="text-base sm:text-2xl font-extrabold text-primary-600 break-words">{formatCurrency(project.collectedAmount || 0, undefined, locale)}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('collected')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base sm:text-2xl font-extrabold text-gray-800 break-words">{formatCurrency(Number(project.value), undefined, locale)}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('target')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base sm:text-2xl font-extrabold text-gray-800">{project._count?.donations || 0}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('donationsCount')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            {translation?.description && (
              <div className="card p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{t('aboutProject')}</h2>
                <div
                  className="prose prose-gray max-w-none text-gray-600 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: translation.description }}
                />
              </div>
            )}

            {/* W7-E2-S2: public money trail, funding sources, decisions */}
            <ProjectTransparency projectId={Number(id)} locale={locale} />

            {/* Study link */}
            {hasStudy && (
              <Link
                href={`/${locale}/projects/${id}/study`}
                className="card p-5 flex items-center justify-between hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{t('projectStudy')}</p>
                    <p className="text-sm text-gray-500">{t('readStudyReport')}</p>
                  </div>
                </div>
                <span className="text-primary-600 text-sm font-medium group-hover:underline">{t('viewStudy')}</span>
              </Link>
            )}

            {/* Gallery */}
            {galleryFiles.length > 0 && (
              <div className="card p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">{t('gallery')}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {galleryFiles.map((file: any) => (
                    <div key={file.id} className="relative h-32 rounded-xl overflow-hidden">
                      <Image src={file.url} alt={file.name || ''} fill className="object-cover hover:scale-105 transition-transform duration-300" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <ProjectDonateSidebar
              projectId={project.id}
              locale={locale}
              studyStatus={studyStatus}
              isCompleted={!!project.isCompleted}
            />

            {project.financialOfficer && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wide">{t('financialOfficer')}</h3>
                <p className="font-semibold text-gray-900">
                  {project.financialOfficer.firstName} {project.financialOfficer.lastName}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
