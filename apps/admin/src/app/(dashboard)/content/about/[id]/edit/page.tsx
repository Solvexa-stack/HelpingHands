'use client';
import { BlockForm } from '@/components/content/block-form';

export default function EditAboutPage({ params }: { params: { id: string } }) {
  return <BlockForm category="about_us" backHref="/content/about" backLabel="Back to About" title="Edit About Section" editId={Number(params.id)} showClassification showOrder />;
}
