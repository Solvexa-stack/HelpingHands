'use client';
import { BlockForm } from '@/components/content/block-form';

export default function EditNewsPage({ params }: { params: { id: string } }) {
  return <BlockForm category="news" backHref="/content/news" backLabel="Back to News" title="Edit News Article" editId={Number(params.id)} />;
}
