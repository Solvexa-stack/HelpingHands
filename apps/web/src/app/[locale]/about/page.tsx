import { blocksApi } from '@/lib/api';
import { getTranslation } from '@/lib/utils';
import { Heart, Shield, Users, Globe } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'About Us' };
export const revalidate = 3600;

interface Props { params: { locale: string } }

export default async function AboutPage({ params: { locale } }: Props) {
  let blocks: any[] = [];
  try {
    const data: any = await blocksApi.list({ category: 'about_us', lang: locale, activeOnly: true });
    blocks = data?.data || [];
  } catch {}

  const values = [
    { icon: Heart, title: 'Compassion', desc: 'We believe every act of giving, no matter how small, creates waves of positive change.' },
    { icon: Shield, title: 'Transparency', desc: 'Every donation is tracked and verified. You always know where your money goes.' },
    { icon: Users, title: 'Community', desc: 'We connect diaspora communities with their home regions through meaningful impact.' },
    { icon: Globe, title: 'Global Reach', desc: 'Operating across borders to ensure help reaches where it is needed most.' },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand to-brand-light text-white py-20">
        <div className="container max-w-3xl text-center">
          <h1 className="text-5xl font-extrabold mb-6">About HelpingHands</h1>
          <p className="text-blue-100 text-xl leading-relaxed">
            We are a community-driven platform connecting generous donors with impactful projects worldwide.
            Building bridges between compassion and action.
          </p>
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
          <h2 className="text-3xl font-extrabold text-center text-gray-900 mb-12">Our Values</h2>
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
