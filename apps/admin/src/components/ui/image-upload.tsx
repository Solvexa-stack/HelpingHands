'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, X, ImageIcon, RefreshCw } from 'lucide-react';
import { filesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

interface Props {
  /** Current cover image URL to preview (remote). */
  value?: string;
  /** Called with the final URL once it is known (after upload) or '' when removed. */
  onChange: (url: string) => void;
  /**
   * Deferred mode: when there is no referenceId yet (e.g. the create form, where
   * the owning record does not exist), the raw File is handed back here so the
   * parent can upload it right after the record is created. null clears it.
   */
  onFileSelect?: (file: File | null) => void;
  referenceId?: number;
  referenceType?: string;
  /** Max accepted size in MB (default 10, matching the API limit). */
  maxSizeMb?: number;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// The API returns an absolute URL (app.url + /uploads/...). Only when a relative
// path ever comes back do we prefix it with the API origin — never a hardcoded
// localhost, which broke every uploaded image in production.
const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:4000/api';
const FILE_BASE = API_URL.replace(/\/api\/?$/, '');
function absolute(url: string) {
  return /^https?:\/\//.test(url) ? url : `${FILE_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function ImageUpload({ value, onChange, onFileSelect, referenceId, referenceType, maxSizeMb = 10 }: Props) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  // Deferred-mode local preview (object URL) for a file not yet uploaded.
  const [localPreview, setLocalPreview] = useState('');
  const canUpload = !!referenceId && referenceId > 0;

  // Revoke the object URL when it changes or the component unmounts.
  useEffect(() => {
    return () => { if (localPreview) URL.revokeObjectURL(localPreview); };
  }, [localPreview]);

  const validate = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) return t('blockForm.imageUpload.onlyImages');
    if (file.size > maxSizeMb * 1024 * 1024) return t('blockForm.imageUpload.tooLarge', { size: maxSizeMb });
    return null;
  };

  const handleFile = async (file: File) => {
    const validationError = validate(file);
    if (validationError) { setError(validationError); return; }
    setError('');

    if (!canUpload) {
      // Deferred: keep the file, preview locally, let the parent upload on save.
      if (localPreview) URL.revokeObjectURL(localPreview);
      const preview = URL.createObjectURL(file);
      setLocalPreview(preview);
      onFileSelect?.(file);
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('referenceId', String(referenceId));
      form.append('referenceType', referenceType ?? 'block');
      form.append('fileType', 'image');
      form.append('isCover', 'true');
      const result = await filesApi.upload(form);
      onChange(absolute(result.url));
    } catch (e: any) {
      setError(e?.response?.data?.message || t('blockForm.imageUpload.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = () => {
    if (localPreview) { URL.revokeObjectURL(localPreview); setLocalPreview(''); }
    setError('');
    onFileSelect?.(null);
    onChange('');
  };

  const previewUrl = localPreview || value;

  return (
    <div className="space-y-2">
      {previewUrl ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Preview" className="w-full h-48 object-cover" />
          {localPreview && (
            <span className="absolute bottom-2 start-2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full">
              {t('blockForm.imageUpload.pendingUpload')}
            </span>
          )}
          <div className="absolute top-2 end-2 flex gap-1.5">
            <button type="button" onClick={() => inputRef.current?.click()} title={t('blockForm.imageUpload.replace')}
              className="w-7 h-7 bg-white rounded-full shadow flex items-center justify-center hover:bg-gray-100 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={remove} title={t('blockForm.imageUpload.remove')}
              className="w-7 h-7 bg-white rounded-full shadow flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
            dragging ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50',
            uploading && 'pointer-events-none opacity-60',
          )}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <span className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full inline-block" />
              <p className="text-sm text-gray-500">{t('blockForm.imageUpload.uploading')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                {dragging ? <Upload className="w-6 h-6 text-primary-500" /> : <ImageIcon className="w-6 h-6 text-gray-400" />}
              </div>
              <p className="text-sm font-medium text-gray-700">
                {t('blockForm.imageUpload.dropHere')} <span className="text-primary-600">{t('blockForm.imageUpload.browse')}</span>
              </p>
              <p className="text-xs text-gray-400">{t('blockForm.imageUpload.sizeHint')}</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      <input ref={inputRef} type="file" accept={ALLOWED_TYPES.join(',')} className="hidden" onChange={onFileChange} />
    </div>
  );
}
