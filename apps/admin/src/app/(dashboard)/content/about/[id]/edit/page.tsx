'use client';
import { BlockForm } from '@/components/content/block-form';
import { useLanguage } from '@/contexts/language-context';

export default function EditAboutPage({ params }: { params: { id: string } }) {
  const { t } = useLanguage();
  return <BlockForm category="about_us" backHref="/content/about" backLabel={t('blockForm.backLabels.about')} title={t('blockForm.titles.editAbout')} editId={Number(params.id)} showClassification showOrder />;
}
