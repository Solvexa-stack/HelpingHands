'use client';
import { BlockForm } from '@/components/content/block-form';

export default function NewAboutPage() {
  return <BlockForm category="about_us" backHref="/content/about" backLabel="Back to About" title="New About Section" showClassification showOrder />;
}
