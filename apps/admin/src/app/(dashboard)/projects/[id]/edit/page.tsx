'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { blocksApi, projectsApi, adminsApi } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { ImageGallery } from '@/components/ui/image-gallery';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { useLanguage } from '@/contexts/language-context';

const CATEGORIES = ['agricultural', 'industrial', 'trading'];

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export default function EditProjectPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { success, error: toastError } = useToast();
  const [activeLang, setActiveLang] = useState('en');
  const [ready, setReady] = useState(false);

  const LANGS = [
    { code: 'en', label: t('blockForm.langEnglish') },
    { code: 'ar', label: t('blockForm.langArabic') },
    { code: 'fr', label: t('blockForm.langFrench') },
  ];

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
  });

  const [blockId, setBlockId] = useState<number | null>(null);

  const { data: projectData } = useQuery({
    queryKey: ['project', params.id],
    queryFn: () => projectsApi.get(Number(params.id)),
  });

  const { data: officers } = useQuery({
    queryKey: ['financial-officers'],
    queryFn: adminsApi.financialOfficers,
  });

  useEffect(() => {
    if (!projectData || ready) return;
    setBlockId(projectData.blockId);
    setProject({
      category: projectData.category || 'agricultural',
      value: String(projectData.value || ''),
      location: projectData.location || '',
      expectedStartDate: projectData.expectedStartDate ? projectData.expectedStartDate.split('T')[0] : '',
      dateOfCompletion: projectData.dateOfCompletion ? projectData.dateOfCompletion.split('T')[0] : '',
      financialOfficerId: projectData.financialOfficerId ? String(projectData.financialOfficerId) : '',
    });
    const trans: Record<string, any> = {
      en: { name: '', slug: '', brief: '', description: '' },
      ar: { name: '', slug: '', brief: '', description: '' },
      fr: { name: '', slug: '', brief: '', description: '' },
    };
    (projectData.block?.translations || []).forEach((tr: any) => {
      if (trans[tr.languageCode]) trans[tr.languageCode] = { name: tr.name, slug: tr.slug, brief: tr.brief, description: tr.description };
    });
    setTranslations(trans);
    setReady(true);
  }, [projectData, ready]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (blockId) {
        await blocksApi.update(blockId, {
          translations: LANGS.map((l) => ({ languageCode: l.code, ...translations[l.code] })).filter((tr) => tr.name),
        });
      }
      return projectsApi.update(Number(params.id), {
        category: project.category,
        value: Number(project.value),
        location: project.location || undefined,
        expectedStartDate: project.expectedStartDate || undefined,
        dateOfCompletion: project.dateOfCompletion || undefined,
        financialOfficerId: project.financialOfficerId ? Number(project.financialOfficerId) : undefined,
      });
    },
    onSuccess: () => { success(t('projectForm.toast.updated')); router.push('/projects'); },
    onError: (err: any) => toastError(err?.response?.data?.message || t('projectForm.toast.updateFailed')),
  });

  const setTrans = (lang: string, field: string, value: string) => {
    setTranslations((prev) => ({
      ...prev,
      [lang]: { ...prev[lang], [field]: value, ...(field === 'name' && lang === 'en' ? { slug: slugify(value) } : {}) },
    }));
  };

  if (!ready) return <div className="flex items-center justify-center py-20 text-gray-400">{t('common.loading')}</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="btn-ghost btn-sm p-1.5 rounded-lg"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="page-title">{t('projectForm.editProjectTitle')}</h1>
      </div>

      <div className="card p-6 space-y-6">
        <h2 className="font-semibold text-gray-900">{t('blockForm.contentTranslations')}</h2>
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
                <label className="label">{t('projectForm.nameLabel')}</label>
                <input className="input" value={translations[l.code].name}
                  onChange={(e) => setTrans(l.code, 'name', e.target.value)} placeholder={t('projectForm.namePlaceholder')} />
              </div>
              <div>
                <label className="label">{t('blockForm.slugLabel')}</label>
                <input className="input font-mono text-sm" value={translations[l.code].slug}
                  onChange={(e) => setTrans(l.code, 'slug', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">{t('blockForm.briefLabel')}</label>
              <input className="input" value={translations[l.code].brief}
                onChange={(e) => setTrans(l.code, 'brief', e.target.value)} />
            </div>
            <div>
              <label className="label">{t('blockForm.descriptionLabel')}</label>
              <RichTextEditor
                value={translations[l.code].description}
                onChange={(val) => setTrans(l.code, 'description', val)}
              />
            </div>
          </div>
        ))}
      </div>

      {blockId && (
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">{t('projectForm.imageGalleryHeading')}</h2>
          <p className="text-sm text-gray-400">{t('projectForm.imageGalleryHint')}</p>
          <ImageGallery referenceId={blockId} referenceType="block" />
        </div>
      )}

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">{t('projectForm.detailsHeading')}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{t('projectForm.categoryLabel')}</label>
            <select className="input" value={project.category} onChange={(e) => setProject({ ...project, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`projectForm.categories.${c}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('projectForm.targetAmountLabel')}</label>
            <input type="number" className="input" value={project.value}
              onChange={(e) => setProject({ ...project, value: e.target.value })} min="1" />
          </div>
          <div>
            <label className="label">{t('projectForm.locationLabel')}</label>
            <input className="input" value={project.location}
              onChange={(e) => setProject({ ...project, location: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('projects.detail.financialOfficer')}</label>
            <select className="input" value={project.financialOfficerId} onChange={(e) => setProject({ ...project, financialOfficerId: e.target.value })}>
              <option value="">{t('projectForm.none')}</option>
              {(officers as any[])?.map((o: any) => (
                <option key={o.id} value={o.id}>{o.firstName} {o.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('projectForm.expectedStartDateLabel')}</label>
            <input type="date" className="input" value={project.expectedStartDate}
              onChange={(e) => setProject({ ...project, expectedStartDate: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('projectForm.completionDateLabel')}</label>
            <input type="date" className="input" value={project.dateOfCompletion}
              onChange={(e) => setProject({ ...project, dateOfCompletion: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Link href="/projects" className="btn-secondary btn-md">{t('common.cancel')}</Link>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !translations.en.name || !project.value}
          className="btn-primary btn-md gap-2">
          {mutation.isPending ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-4 h-4" />}
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}
