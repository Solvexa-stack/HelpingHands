'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { blocksApi, projectsApi, adminsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { ImageUpload } from '@/components/ui/image-upload';

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'Arabic' },
  { code: 'fr', label: 'French' },
];

const CATEGORIES = ['agricultural', 'industrial', 'trading'];

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export default function NewProjectPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [activeLang, setActiveLang] = useState('en');

  const [translations, setTranslations] = useState<Record<string, any>>({
    en: { name: '', slug: '', brief: '', description: '' },
    ar: { name: '', slug: '', brief: '', description: '' },
    fr: { name: '', slug: '', brief: '', description: '' },
  });

  const [project, setProject] = useState({
    category: 'agricultural',
    value: '',
    location: '',
    expectedStartDate: '',
    dateOfCompletion: '',
    financialOfficerId: '',
    imageUrl: '',
  });

  const { data: officers } = useQuery({
    queryKey: ['financial-officers'],
    queryFn: adminsApi.financialOfficers,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const block = await blocksApi.create({
        category: 'project',
        imageUrl: project.imageUrl || undefined,
        translations: LANGS.map((l) => ({ languageCode: l.code, ...translations[l.code] })).filter((t) => t.name),
      });
      return projectsApi.create({
        blockId: block.id,
        category: project.category,
        value: Number(project.value),
        location: project.location || undefined,
        expectedStartDate: project.expectedStartDate || undefined,
        dateOfCompletion: project.dateOfCompletion || undefined,
        financialOfficerId: project.financialOfficerId ? Number(project.financialOfficerId) : undefined,
      });
    },
    onSuccess: () => { success('Project created'); router.push('/projects'); },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Failed to create project'),
  });

  const setTrans = (lang: string, field: string, value: string) => {
    setTranslations((prev) => ({
      ...prev,
      [lang]: { ...prev[lang], [field]: value, ...(field === 'name' && lang === 'en' ? { slug: slugify(value) } : {}) },
    }));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="btn-ghost btn-sm p-1.5 rounded-lg"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="page-title">New Project</h1>
      </div>

      <div className="card p-6 space-y-6">
        <h2 className="font-semibold text-gray-900">Content & Translations</h2>
        <div>
          <label className="label">Cover Image</label>
          <ImageUpload value={project.imageUrl} onChange={(url) => setProject({ ...project, imageUrl: url })} referenceType="block" />
        </div>

        {/* Lang tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => setActiveLang(l.code)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeLang === l.code ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {l.label}
            </button>
          ))}
        </div>

        {LANGS.map((l) => (
          <div key={l.code} className={l.code === activeLang ? 'space-y-4' : 'hidden'}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Name *</label>
                <input className="input" value={translations[l.code].name}
                  onChange={(e) => setTrans(l.code, 'name', e.target.value)} placeholder="Project name" />
              </div>
              <div>
                <label className="label">Slug *</label>
                <input className="input font-mono text-sm" value={translations[l.code].slug}
                  onChange={(e) => setTrans(l.code, 'slug', e.target.value)} placeholder="project-slug" />
              </div>
            </div>
            <div>
              <label className="label">Brief *</label>
              <input className="input" value={translations[l.code].brief}
                onChange={(e) => setTrans(l.code, 'brief', e.target.value)} placeholder="Short description" />
            </div>
            <div>
              <label className="label">Description *</label>
              <textarea className="input resize-none" rows={5} value={translations[l.code].description}
                onChange={(e) => setTrans(l.code, 'description', e.target.value)} placeholder="Full project description..." />
            </div>
          </div>
        ))}
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Project Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Category *</label>
            <select className="input" value={project.category} onChange={(e) => setProject({ ...project, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Target Amount ($) *</label>
            <input type="number" className="input" value={project.value}
              onChange={(e) => setProject({ ...project, value: e.target.value })} placeholder="50000" min="1" />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={project.location}
              onChange={(e) => setProject({ ...project, location: e.target.value })} placeholder="City, Country" />
          </div>
          <div>
            <label className="label">Financial Officer</label>
            <select className="input" value={project.financialOfficerId} onChange={(e) => setProject({ ...project, financialOfficerId: e.target.value })}>
              <option value="">None</option>
              {(officers as any[])?.map((o: any) => (
                <option key={o.id} value={o.id}>{o.firstName} {o.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Expected Start Date</label>
            <input type="date" className="input" value={project.expectedStartDate}
              onChange={(e) => setProject({ ...project, expectedStartDate: e.target.value })} />
          </div>
          <div>
            <label className="label">Completion Date</label>
            <input type="date" className="input" value={project.dateOfCompletion}
              onChange={(e) => setProject({ ...project, dateOfCompletion: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Link href="/projects" className="btn-secondary btn-md">Cancel</Link>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !translations.en.name || !project.value}
          className="btn-primary btn-md gap-2">
          {mutation.isPending ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-4 h-4" />}
          Create Project
        </button>
      </div>
    </div>
  );
}
