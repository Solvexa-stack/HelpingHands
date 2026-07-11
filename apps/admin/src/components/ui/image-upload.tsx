'use client';

import { useRef, useState } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';
import { filesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/language-context';

interface Props {
  value?: string;
  onChange: (url: string) => void;
  referenceId?: number;
  referenceType?: string;
}

// Upload only works after a record is saved (FK constraint on files table).
// When referenceId is missing, we show URL-only mode.

export function ImageUpload({ value, onChange, referenceId, referenceType }: Props) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const canUpload = !!referenceId && referenceId > 0;

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError(t('blockForm.imageUpload.onlyImages')); return; }
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('referenceId', String(referenceId ?? 0));
      form.append('referenceType', referenceType ?? 'block');
      form.append('fileType', 'image');
      form.append('isCover', 'true');
      const result = await filesApi.upload(form);
      onChange(`http://localhost:4000${result.url}`);
    } catch (e: any) {
      setError(e?.response?.data?.message || t('blockForm.imageUpload.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
  };

  return (
    <div className="space-y-2">
      {/* Preview */}
      {value && (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          <img src={value} alt="Preview" className="w-full h-48 object-cover" />
          <button onClick={() => onChange('')}
            className="absolute top-2 end-2 w-7 h-7 bg-white rounded-full shadow flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Drag & drop — only available in edit mode (referenceId exists) */}
      {canUpload && !value && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
            dragging ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50',
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
              <p className="text-sm font-medium text-gray-700">{t('blockForm.imageUpload.dropHere')} <span className="text-primary-600">{t('blockForm.imageUpload.browse')}</span></p>
              <p className="text-xs text-gray-400">{t('blockForm.imageUpload.sizeHint')}</p>
            </div>
          )}
        </div>
      )}

      {/* URL input — always shown */}
      <input type="text" className="input text-sm" value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={canUpload ? t('blockForm.imageUpload.pastePlaceholder') : t('blockForm.imageUpload.pastePlaceholderNoUpload')} />

      {!canUpload && (
        <p className="text-xs text-gray-400">{t('blockForm.imageUpload.saveFirstHint')}</p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
    </div>
  );
}
