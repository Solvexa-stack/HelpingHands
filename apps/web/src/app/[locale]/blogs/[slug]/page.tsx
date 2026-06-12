import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar } from 'lucide-react';
import type { Metadata } from 'next';
import { blocksApi } from '@/lib/api';
import { getTranslation, formatDate } from '@/lib/utils';

export const revalidate = 60;

interface Props { params: { locale: string; slug: string } }

async function fetchBlock(slug: string) {
  try {
    if (/^\d+$/.test(slug)) return await blocksApi.get(Number(slug));
    return await blocksApi.getBySlug(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params: { locale, slug } }: Props): Promise<Metadata> {
  const block = await fetchBlock(slug);
  if (!block) return { title: 'Blog Post' };
  const t = getTranslation(block.translations || [], locale);
  return { title: t?.name || 'Blog Post', description: t?.brief };
}

export default async function BlogDetailPage({ params: { locale, slug } }: Props) {
  const block = await fetchBlock(slug);
  if (!block || block.category !== 'blog') notFound();

  const t = getTranslation(block.translations || [], locale);
  const cover = block.files?.find((f: any) => f.isCover) || block.files?.[0];
  const imageUrl = cover?.url || block.imageUrl;

  return (
    <div className="bg-white min-h-screen">
      {/* Hero */}
      <div className="relative h-72 md:h-96 bg-gray-100 overflow-hidden">
        {imageUrl ? (
          <Image src={imageUrl} alt={t?.name || ''} fill className="object-cover" priority />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-600 to-primary-800" />
        )}
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute bottom-0 left-0 right-0 p-8 container">
          <Link
            href={`/${locale}/blogs`}
            className="inline-flex items-center gap-2 text-white/80 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
            {t?.name || 'Untitled'}
          </h1>
        </div>
      </div>

      {/* Body */}
      <div className="container max-w-3xl py-12">
        {/* Meta */}
        {block.createdAt && (
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
            <Calendar className="w-4 h-4" />
            {formatDate(block.createdAt, locale)}
          </div>
        )}

        {/* Brief */}
        {t?.brief && (
          <p className="text-xl text-gray-600 font-medium leading-relaxed mb-8 border-l-4 border-primary-500 pl-5">
            {t.brief}
          </p>
        )}

        {/* Description */}
        {t?.description && (
          <div className="prose prose-lg max-w-none text-gray-700 leading-relaxed whitespace-pre-line">
            {t.description}
          </div>
        )}

        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link
            href={`/${locale}/blogs`}
            className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>
        </div>
      </div>
    </div>
  );
}
