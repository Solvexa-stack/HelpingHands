'use client';
import { BlockForm } from '@/components/content/block-form';

export default function EditBlogPage({ params }: { params: { id: string } }) {
  return <BlockForm category="blog" backHref="/content/blogs" backLabel="Back to Blogs" title="Edit Blog Post" editId={Number(params.id)} />;
}
