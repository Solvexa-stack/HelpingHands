import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { projectsApi } from '@/lib/api';
import { ProjectCard } from '@/components/projects/project-card';
import { ProjectFilters } from '@/components/projects/project-filters';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Projects' };
export const revalidate = 60;

interface Props {
  params: { locale: string };
  searchParams: { category?: string; search?: string; isCompleted?: string; page?: string; location?: string };
}

export default async function ProjectsPage({ params: { locale }, searchParams }: Props) {
  const t = await getTranslations({ locale, namespace: 'projects' });

  const params: Record<string, any> = {
    lang: locale,
    limit: 12,
    page: searchParams.page || 1,
  };
  if (searchParams.category) params.category = searchParams.category;
  if (searchParams.search) params.search = searchParams.search;
  if (searchParams.isCompleted !== undefined) params.isCompleted = searchParams.isCompleted === 'true';
  if (searchParams.location) params.location = searchParams.location;

  let projectsData = { data: [], meta: { total: 0, totalPages: 0, page: 1 } };
  try {
    projectsData = await projectsApi.list(params);
  } catch {}

  const { data: projects, meta } = projectsData as any;

  return (
    <div className="bg-gray-50 min-h-screen py-12">
      <div className="container">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-3">{t('title')}</h1>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        {/* Filters */}
        <ProjectFilters locale={locale} />

        {/* Projects grid */}
        {projects?.length > 0 ? (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
              {projects.map((project: any) => (
                <ProjectCard key={project.id} project={project} locale={locale} />
              ))}
            </div>

            {/* Pagination */}
            {meta?.totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-10">
                {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((page) => (
                  <a
                    key={page}
                    href={`?page=${page}${searchParams.category ? `&category=${searchParams.category}` : ''}${searchParams.search ? `&search=${searchParams.search}` : ''}`}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
                      page === Number(meta.page)
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </a>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">{t('noProjects')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
