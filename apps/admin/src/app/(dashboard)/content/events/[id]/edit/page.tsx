'use client';
import { BlockForm } from '@/components/content/block-form';
import { useLanguage } from '@/contexts/language-context';

export default function EditEventPage({ params }: { params: { id: string } }) {
  const { t } = useLanguage();
  return <BlockForm category="event" backHref="/content/events" backLabel={t('blockForm.backLabels.events')} title={t('blockForm.titles.editEvent')} editId={Number(params.id)} showDates />;
}
