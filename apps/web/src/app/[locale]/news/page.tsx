import { blocksApi } from '@/lib/api';
import { BlockCard } from '@/components/blocks/block-card';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'News' };
export const revalidate = 60;

interface Props { params: { locale: string }; searchParams: { page?: string } }

export default async function NewsPage({ params: { locale }, searchParams }: Props) {
  let newsData = { data: [], meta: { total: 0, totalPages: 0 } };
  try {
    newsData = await blocksApi.list({
      category: 'news',
      lang: locale,
      page: searchParams.page || 1,
      limit: 9,
    });
  } catch {}

  const { data: news, meta } = newsData as any;

  return (
    <div className="bg-gray-50 min-h-screen py-12">
      <div className="container">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Latest News</h1>
          <p className="text-gray-500 text-lg">Stay updated with the latest from HelpingHands</p>
        </div>

        {news?.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.map((item: any) => <BlockCard key={item.id} block={item} locale={locale} category="news" />)}
          </div>
        ) : (
          <div className="text-center py-16 text-gray-400">No news articles yet.</div>
        )}
      </div>
    </div>
  );
}
