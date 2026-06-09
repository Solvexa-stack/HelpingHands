'use client';
import { BlockForm } from '@/components/content/block-form';

export default function NewEventPage() {
  return <BlockForm category="event" backHref="/content/events" backLabel="Back to Events" title="New Event" showDates />;
}
