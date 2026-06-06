import { blocksApi } from '@/lib/api';
import { BlockCard } from '@/components/blocks/block-card';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Blog' };
export const revalidate = 60;

interface Props { params: { locale: string }; searchParams: { page?: string } }

export default async function BlogsPage({ params: { locale }, searchParams }: Props) {
  let blogsData = { data: [], meta: {} };
  try {
    blogsData = await blocksApi.list({ category: 'blog', lang: locale, page: searchParams.page || 1, limit: 9 });
  } catch {}
  const { data: blogs } = blogsData as any;

  return (
    <div className="bg-gray-50 min-h-screen py-12">
      <div className="container">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Our Blog</h1>
          <p className="text-gray-500 text-lg">Stories, updates, and insights from our team</p>
        </div>
        {blogs?.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {blogs.map((item: any) => <BlockCard key={item.id} block={item} locale={locale} category="blogs" />)}
          </div>
        ) : (
          <div className="text-center py-16 text-gray-400">No blog posts yet.</div>
        )}
      </div>
    </div>
  );
}
