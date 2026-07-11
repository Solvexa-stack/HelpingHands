'use client';
import { BlockForm } from '@/components/content/block-form';
import { useLanguage } from '@/contexts/language-context';

export default function EditNewsPage({ params }: { params: { id: string } }) {
  const { t } = useLanguage();
  return <BlockForm category="news" backHref="/content/news" backLabel={t('blockForm.backLabels.news')} title={t('blockForm.titles.editNews')} editId={Number(params.id)} />;
}
