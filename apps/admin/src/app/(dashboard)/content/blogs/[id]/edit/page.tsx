'use client';
import { BlockForm } from '@/components/content/block-form';
import { useLanguage } from '@/contexts/language-context';

export default function EditBlogPage({ params }: { params: { id: string } }) {
  const { t } = useLanguage();
  return <BlockForm category="blog" backHref="/content/blogs" backLabel={t('blockForm.backLabels.blogs')} title={t('blockForm.titles.editBlog')} editId={Number(params.id)} />;
}
