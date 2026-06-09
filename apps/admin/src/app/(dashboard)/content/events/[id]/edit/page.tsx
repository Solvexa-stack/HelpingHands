'use client';
import { BlockForm } from '@/components/content/block-form';

export default function EditEventPage({ params }: { params: { id: string } }) {
  return <BlockForm category="event" backHref="/content/events" backLabel="Back to Events" title="Edit Event" editId={Number(params.id)} showDates />;
}
