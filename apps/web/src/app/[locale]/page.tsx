import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowRight, Heart, Shield, Users } from 'lucide-react';
import { projectsApi, blocksApi } from '@/lib/api';
import { ProjectCard } from '@/components/projects/project-card';
import { BlockCard } from '@/components/blocks/block-card';
import type { Metadata } from 'next';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return { title: 'HelpingHands — Make a Difference Today' };
}

async function getHomeData(locale: string) {
  try {
    const [projects, news, events] = await Promise.allSettled([
      projectsApi.list({ limit: 6, isCompleted: false, lang: locale }),
      blocksApi.list({ category: 'news', limit: 3, lang: locale }),
      blocksApi.list({ category: 'event', limit: 3, lang: locale }),
    ]);

    return {
      projects: projects.status === 'fulfilled' ? projects.value?.data || [] : [],
      news: news.status === 'fulfilled' ? news.value?.data || [] : [],
      events: events.status === 'fulfilled' ? events.value?.data || [] : [],
    };
  } catch {
    return { projects: [], news: [], events: [] };
  }
}

export default async function HomePage({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'home' });
  const { projects, news, events } = await getHomeData(locale);

  const features = [
    { icon: Heart, title: 'Community Driven', desc: 'Every project is vetted and supported by our trusted community of donors and volunteers.' },
    { icon: Shield, title: 'Transparent & Verified', desc: 'All donations are tracked with QR codes and verified by our team before approval.' },
    { icon: Users, title: 'Real Impact', desc: 'See exactly where your money goes with detailed project progress reports.' },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-brand via-brand-light to-primary-700 text-white overflow-hidden">
        <div className="absolute inset-0 bg-[url('/hero-pattern.svg')] opacity-10" />
        <div className="container relative py-24 lg:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-medium mb-6">
              <Heart className="w-3.5 h-3.5 fill-current" />
              <span>Making the world a better place</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-6xl font-extrabold mb-6 leading-tight">
              {t('hero.title')}
            </h1>
            <p className="text-xl text-blue-100 mb-8 leading-relaxed max-w-2xl">
              {t('hero.subtitle')}
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href={`/${locale}/projects`} className="btn-primary bg-white text-primary-700 hover:bg-blue-50 text-base px-8 py-3">
                {t('hero.cta')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
              <Link href={`/${locale}/about`} className="btn-secondary border-white text-white hover:bg-white/10 text-base px-8 py-3">
                {t('hero.ctaSecondary')}
              </Link>
            </div>
          </div>
        </div>
        {/* Wave divider */}
        <div className="absolute bottom-0 start-0 end-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 60L1440 60L1440 0C1200 40 960 60 720 60C480 60 240 40 0 0L0 60Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white py-12">
        <div className="container">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {[
              { value: '150+', label: t('stats.projects') },
              { value: '5,000+', label: t('stats.donors') },
              { value: '$2.5M+', label: t('stats.collected') },
              { value: '80+', label: t('stats.completed') },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-4xl font-extrabold text-primary-600 mb-1">{value}</p>
                <p className="text-gray-500 text-sm">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-20">
        <div className="container">
          <div className="grid md:grid-cols-3 gap-8">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-8 shadow-sm text-center">
                <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <Icon className="w-7 h-7 text-primary-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Projects */}
      {projects.length > 0 && (
        <section className="py-20 bg-white">
          <div className="container">
            <div className="flex items-end justify-between mb-10">
              <div>
                <h2 className="text-3xl font-extrabold text-gray-900">{t('featuredProjects')}</h2>
                <p className="text-gray-500 mt-2">Support a project and create lasting impact</p>
              </div>
              <Link href={`/${locale}/projects`} className="text-primary-600 font-semibold flex items-center gap-1.5 hover:gap-2.5 transition-all">
                {t('viewAll')} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project: any) => (
                <ProjectCard key={project.id} project={project} locale={locale} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Latest News */}
      {news.length > 0 && (
        <section className="py-20 bg-gray-50">
          <div className="container">
            <div className="flex items-end justify-between mb-10">
              <div>
                <h2 className="text-3xl font-extrabold text-gray-900">{t('latestNews')}</h2>
              </div>
              <Link href={`/${locale}/news`} className="text-primary-600 font-semibold flex items-center gap-1.5 hover:gap-2.5 transition-all">
                {t('viewAll')} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {news.map((item: any) => (
                <BlockCard key={item.id} block={item} locale={locale} category="news" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA Banner */}
      <section className="bg-primary-600 py-16 text-white text-center">
        <div className="container max-w-2xl">
          <h2 className="text-3xl font-extrabold mb-4">Ready to Make a Difference?</h2>
          <p className="text-primary-100 mb-8 text-lg">
            Join thousands of donors who are changing lives through HelpingHands.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href={`/${locale}/auth/register`} className="btn-primary bg-white text-primary-700 hover:bg-primary-50 text-base px-8 py-3">
              Get Started Free
            </Link>
            <Link href={`/${locale}/projects`} className="btn-secondary border-white text-white hover:bg-white/10 text-base px-8 py-3">
              Browse Projects
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
