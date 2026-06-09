'use client';
import { BlockForm } from '@/components/content/block-form';

export default function NewBlogPage() {
  return <BlockForm category="blog" backHref="/content/blogs" backLabel="Back to Blogs" title="New Blog Post" />;
}
