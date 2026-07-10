import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, MapPin, FileText, ChevronDown } from 'lucide-react';
import { projectsApi, studyApi } from '@/lib/api';
import { getTranslation, formatDate } from '@/lib/utils';
import { VoteForm } from '@/components/study/vote-form';
import { VoteResults } from '@/components/study/vote-results';
import type { Metadata } from 'next';

interface Props { params: { locale: string; id: string } }

export async function generateMetadata({ params: { locale, id } }: Props): Promise<Metadata> {
  try {
    const project = await projectsApi.get(Number(id), locale);
    const translation = getTranslation(project?.block?.translations || [], locale);
    return { title: `${translation?.name || 'Project'} — Study` };
  } catch { return { title: 'Study' }; }
}

export const revalidate = 60;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export default async function StudyPage({ params: { locale, id } }: Props) {
  const t = await getTranslations({ locale, namespace: 'study' });

  let project: any;
  let study: any;
  try {
    [project, study] = await Promise.all([
      projectsApi.get(Number(id), locale),
      studyApi.getByProject(Number(id)),
    ]);
  } catch { notFound(); }

  const VISIBLE_STATUSES = ['published', 'voting_open', 'voting_closed', 'approved', 'rejected'];
  if (!study || !VISIBLE_STATUSES.includes(study.status)) notFound();

  const translation = getTranslation(project.block?.translations || [], locale);
  const coverFile = project.block?.files?.find((f: any) => f.isCover) || project.block?.files?.[0];
  const sections = study.sections || [];

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container max-w-4xl space-y-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 flex items-center gap-1.5">
          <Link href={`/${locale}`} className="hover:text-primary-600">Home</Link>
          <span>/</span>
          <Link href={`/${locale}/projects`} className="hover:text-primary-600">Projects</Link>
          <span>/</span>
          <Link href={`/${locale}/projects/${id}`} className="hover:text-primary-600">{translation?.name}</Link>
          <span>/</span>
          <span className="text-gray-900">Study</span>
        </nav>

        {/* Project header */}
        <div className="card overflow-hidden">
          {coverFile?.url && (
            <div className="relative h-52">
              <Image src={coverFile.url} alt={translation?.name || ''} fill className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 start-6 text-white">
                <h1 className="text-2xl font-extrabold">{translation?.name}</h1>
                {project.location && (
                  <p className="flex items-center gap-1.5 text-sm opacity-80 mt-1">
                    <MapPin className="w-3.5 h-3.5" />{project.location}
                  </p>
                )}
              </div>
            </div>
          )}
          {!coverFile?.url && (
            <div className="p-6">
              <h1 className="text-2xl font-extrabold text-gray-900">{translation?.name}</h1>
              {project.location && (
                <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                  <MapPin className="w-3.5 h-3.5" />{project.location}
                </p>
              )}
            </div>
          )}
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
            <span className="badge bg-primary-50 text-primary-700 capitalize text-xs">{project.category}</span>
            <span className="badge bg-gray-100 text-gray-600 capitalize text-xs">{study.status.replace(/_/g, ' ')}</span>
          </div>
        </div>

        {/* Executive Summary */}
        {study.summary && (
          <div className="card p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-3">{t('summary')}</h2>
            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{study.summary}</p>
          </div>
        )}

        {/* Sections */}
        {sections.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-gray-900">{t('sections')}</h2>
            {sections.map((sec: any) => (
              <details key={sec.id} className="card overflow-hidden group">
                <summary className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors list-none">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-primary-500 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm">{sec.name}</span>
                    {sec.isRequired && (
                      <span className="badge bg-primary-50 text-primary-700 text-xs">Required</span>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-6 pb-5 border-t border-gray-100">
                  {sec.description && (
                    <p className="text-xs text-gray-400 mt-3 mb-2">{sec.description}</p>
                  )}
                  {sec.content ? (
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap mt-3">{sec.content}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic mt-3">No content yet.</p>
                  )}
                  {sec.files && sec.files.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attached Files</p>
                      {sec.files.map((f: any) => (
                        <a
                          key={f.id}
                          href={`${API_URL.replace('/api', '')}${f.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary-600 hover:underline"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {f.originalName || f.name || 'File'}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}

        {/* Vote section */}
        <div className="card p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Cast Your Vote</h2>
          <VoteForm
            studyId={study.id}
            studyStatus={study.status}
            votingStartsAt={study.votingStartsAt}
            votingEndsAt={study.votingEndsAt}
          />
        </div>

        {/* Results section */}
        {['voting_open', 'voting_closed', 'approved', 'rejected'].includes(study.status) && (
          <div className="card p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900">{t('results')}</h2>
            <VoteResults studyId={study.id} studyStatus={study.status} />
          </div>
        )}

        {/* Back link */}
        <Link href={`/${locale}/projects/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to project
        </Link>
      </div>
    </div>
  );
}
