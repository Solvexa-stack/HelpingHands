'use client';
import { BlockForm } from '@/components/content/block-form';

export default function NewNewsPage() {
  return <BlockForm category="news" backHref="/content/news" backLabel="Back to News" title="New News Article" />;
}
