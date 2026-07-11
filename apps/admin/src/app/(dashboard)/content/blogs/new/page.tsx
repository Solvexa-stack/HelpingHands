'use client';
import { BlockForm } from '@/components/content/block-form';
import { useLanguage } from '@/contexts/language-context';

export default function NewBlogPage() {
  const { t } = useLanguage();
  return <BlockForm category="blog" backHref="/content/blogs" backLabel={t('blockForm.backLabels.blogs')} title={t('blockForm.titles.newBlog')} />;
}
