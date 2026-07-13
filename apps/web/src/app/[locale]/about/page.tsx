import { getTranslations } from 'next-intl/server';
import { blocksApi } from '@/lib/api';
import { getTranslation } from '@/lib/utils';
import { Heart, Shield, Users, Globe } from 'lucide-react';
import type { Metadata } from 'next';

interface Props { params: { locale: string } }

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  const tNav = await getTranslations({ locale, namespace: 'nav' });
  return { title: tNav('about') };
}

export const revalidate = 3600;

export default async function AboutPage({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'about' });

  let blocks: any[] = [];
  try {
    const data: any = await blocksApi.list({ category: 'about_us', lang: locale, activeOnly: true });
    blocks = data?.data || [];
  } catch {}

  const values = [
    { icon: Heart, title: t('values.compassion.title'), desc: t('values.compassion.desc') },
    { icon: Shield, title: t('values.transparency.title'), desc: t('values.transparency.desc') },
    { icon: Users, title: t('values.community.title'), desc: t('values.community.desc') },
    { icon: Globe, title: t('values.globalReach.title'), desc: t('values.globalReach.desc') },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand to-brand-light text-white py-20">
        <div className="container max-w-3xl text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-6">{t('hero.title')}</h1>
          <p className="text-blue-100 text-xl leading-relaxed">{t('hero.subtitle')}</p>
        </div>
      </section>

      {/* Content blocks from CMS */}
      {blocks.map((block) => {
        const translation = getTranslation(block.translations || [], locale);
        return (
          <section key={block.id} className="py-16 border-b border-gray-100">
            <div className="container max-w-4xl">
              <h2 className="text-3xl font-extrabold text-gray-900 mb-4">{translation?.name}</h2>
              {translation?.brief && <p className="text-gray-500 text-lg mb-6 leading-relaxed">{translation.brief}</p>}
              {translation?.description && (
                <div
                  className="prose prose-gray max-w-none text-gray-600"
                  dangerouslySetInnerHTML={{ __html: translation.description }}
                />
              )}
            </div>
          </section>
        );
      })}

      {/* Values */}
      <section className="py-20 bg-gray-50">
        <div className="container">
          <h2 className="text-3xl font-extrabold text-center text-gray-900 mb-12">{t('valuesHeading')}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="card p-6 text-center">
                <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
