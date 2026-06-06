import { blocksApi } from '@/lib/api';
import { BlockCard } from '@/components/blocks/block-card';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Events' };
export const revalidate = 60;

interface Props { params: { locale: string } }

export default async function EventsPage({ params: { locale } }: Props) {
  let data = { data: [] };
  try { data = await blocksApi.list({ category: 'event', lang: locale, limit: 12 }); } catch {}
  const events = (data as any)?.data || [];

  return (
    <div className="bg-gray-50 min-h-screen py-12">
      <div className="container">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Events</h1>
          <p className="text-gray-500 text-lg">Join us at upcoming events and gatherings</p>
        </div>
        {events.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((item: any) => <BlockCard key={item.id} block={item} locale={locale} category="events" />)}
          </div>
        ) : (
          <div className="text-center py-16 text-gray-400">No upcoming events.</div>
        )}
      </div>
    </div>
  );
}
