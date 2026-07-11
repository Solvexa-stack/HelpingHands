'use client';
import { BlockForm } from '@/components/content/block-form';
import { useLanguage } from '@/contexts/language-context';

export default function NewNewsPage() {
  const { t } = useLanguage();
  return <BlockForm category="news" backHref="/content/news" backLabel={t('blockForm.backLabels.news')} title={t('blockForm.titles.newNews')} />;
}
