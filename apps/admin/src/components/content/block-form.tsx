'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { blocksApi } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { ImageUpload } from '@/components/ui/image-upload';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'Arabic' },
  { code: 'fr', label: 'French' },
];

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

interface BlockFormProps {
  category: string;
  backHref: string;
  backLabel: string;
  title: string;
  editId?: number;
  showDates?: boolean;
  showClassification?: boolean;
  showOrder?: boolean;
}

export function BlockForm({ category, backHref, backLabel, title, editId, showDates, showClassification, showOrder }: BlockFormProps) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [activeLang, setActiveLang] = useState('en');
  const [ready, setReady] = useState(!editId);

  const [translations, setTranslations] = useState<Record<string, any>>({
    en: { name: '', slug: '', brief: '', description: '' },
    ar: { name: '', slug: '', brief: '', description: '' },
    fr: { name: '', slug: '', brief: '', description: '' },
  });

  const [meta, setMeta] = useState({
    imageUrl: '',
    startDate: '',
    endDate: '',
    classification: '',
    orderId: '0',
    isActive: true,
  });

  const { data: blockData } = useQuery({
    queryKey: ['block', editId],
    queryFn: () => blocksApi.get(editId!),
    enabled: !!editId,
  });

  useEffect(() => {
    if (!blockData || ready) return;
    setMeta({
      imageUrl: blockData.imageUrl || '',
      startDate: blockData.startDate ? blockData.startDate.split('T')[0] : '',
      endDate: blockData.endDate ? blockData.endDate.split('T')[0] : '',
      classification: blockData.classification || '',
      orderId: String(blockData.orderId ?? 0),
      isActive: blockData.isActive ?? true,
    });
    const trans: Record<string, any> = {
      en: { name: '', slug: '', brief: '', description: '' },
      ar: { name: '', slug: '', brief: '', description: '' },
      fr: { name: '', slug: '', brief: '', description: '' },
    };
    (blockData.translations || []).forEach((t: any) => {
      if (trans[t.languageCode]) trans[t.languageCode] = { name: t.name, slug: t.slug, brief: t.brief, description: t.description };
    });
    setTranslations(trans);
    setReady(true);
  }, [blockData, ready]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        category,
        imageUrl: meta.imageUrl || undefined,
        startDate: meta.startDate || undefined,
        endDate: meta.endDate || undefined,
        classification: meta.classification || undefined,
        orderId: Number(meta.orderId) || 0,
        isActive: meta.isActive,
        translations: LANGS.map((l) => ({ languageCode: l.code, ...translations[l.code] })).filter((t) => t.name && t.slug),
      };
      return editId ? blocksApi.update(editId, payload) : blocksApi.create(payload);
    },
    onSuccess: () => { success(editId ? 'Updated successfully' : 'Created successfully'); router.push(backHref); },
    onError: (err: any) => {
      const res = err?.response?.data;
      toastError(res?.errors?.join('. ') || res?.message || 'Failed');
    },
  });

  const handleSubmit = () => {
    const incomplete = LANGS.filter((l) => {
      const t = translations[l.code];
      return t.name && t.slug && (!t.brief || !t.description);
    });
    if (incomplete.length) {
      toastError(`Brief and Description are required. Missing for: ${incomplete.map((l) => l.label).join(', ')}`);
      return;
    }
    mutation.mutate();
  };

  const setTrans = (lang: string, field: string, value: string) => {
    setTranslations((prev) => {
      const updated = { ...prev[lang], [field]: value };
      if (field === 'name') {
        const base = lang === 'en' ? slugify(value) : (prev.en.slug || slugify(value));
        updated.slug = lang === 'en' ? slugify(value) : (base ? `${base}-${lang}` : '');
      }
      return { ...prev, [lang]: updated };
    });
  };

  if (!ready) return <div className="flex items-center justify-center py-20 text-gray-400">Loading...</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={backHref} className="btn-ghost btn-sm p-1.5 rounded-lg"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="page-title">{title}</h1>
      </div>

      {/* Translations */}
      <div className="card p-6 space-y-6">
        <h2 className="font-semibold text-gray-900">Content & Translations</h2>
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
                <label className="label">Title *</label>
                <input className="input" value={translations[l.code].name}
                  onChange={(e) => setTrans(l.code, 'name', e.target.value)} placeholder="Title" />
              </div>
              <div>
                <label className="label">Slug *</label>
                <input className="input font-mono text-sm" value={translations[l.code].slug}
                  onChange={(e) => setTrans(l.code, 'slug', e.target.value)} placeholder="title-slug" />
              </div>
            </div>
            <div>
              <label className="label">Brief *</label>
              <input className="input" value={translations[l.code].brief}
                onChange={(e) => setTrans(l.code, 'brief', e.target.value)} placeholder="Short summary..." />
            </div>
            <div>
              <label className="label">Description *</label>
              <RichTextEditor
                value={translations[l.code].description}
                onChange={(val) => setTrans(l.code, 'description', val)}
                placeholder="Full content..."
              />
            </div>
          </div>
        ))}
      </div>

      {/* Meta */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Image</label>
            <ImageUpload
              value={meta.imageUrl}
              onChange={(url) => setMeta({ ...meta, imageUrl: url })}
              referenceId={editId}
              referenceType="block"
            />
          </div>
          {showDates && (
            <>
              <div>
                <label className="label">Start Date</label>
                <input type="date" className="input" value={meta.startDate}
                  onChange={(e) => setMeta({ ...meta, startDate: e.target.value })} />
              </div>
              <div>
                <label className="label">End Date</label>
                <input type="date" className="input" value={meta.endDate}
                  onChange={(e) => setMeta({ ...meta, endDate: e.target.value })} />
              </div>
            </>
          )}
          {showClassification && (
            <div>
              <label className="label">Classification</label>
              <input className="input" value={meta.classification}
                onChange={(e) => setMeta({ ...meta, classification: e.target.value })} placeholder="e.g. mission, vision" />
            </div>
          )}
          {showOrder && (
            <div>
              <label className="label">Display Order</label>
              <input type="number" className="input" value={meta.orderId} min="0"
                onChange={(e) => setMeta({ ...meta, orderId: e.target.value })} />
            </div>
          )}
          <div className="col-span-2 flex items-center gap-3">
            <input type="checkbox" id="isActive" checked={meta.isActive}
              onChange={(e) => setMeta({ ...meta, isActive: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Published (visible on website)</label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Link href={backHref} className="btn-secondary btn-md">{backLabel}</Link>
        <button onClick={handleSubmit} disabled={mutation.isPending || !translations.en.name}
          className="btn-primary btn-md gap-2">
          {mutation.isPending ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-4 h-4" />}
          {editId ? 'Save Changes' : 'Publish'}
        </button>
      </div>
    </div>
  );
}
