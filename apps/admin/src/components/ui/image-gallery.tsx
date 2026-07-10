'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, X, Star, ImageIcon, Loader2 } from 'lucide-react';
import { filesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';

interface Props {
  referenceId: number;
  referenceType?: string;
}

export function ImageGallery({ referenceId, referenceType = 'block' }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const { success, error: toastError } = useToast();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const queryKey = ['gallery', referenceId, referenceType];

  const { data: images = [] } = useQuery({
    queryKey,
    queryFn: () => filesApi.getFiles(referenceId, referenceType),
    enabled: referenceId > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => filesApi.delete(id),
    onSuccess: () => { success('Image removed'); qc.invalidateQueries({ queryKey }); },
    onError: () => toastError('Delete failed'),
  });

  const coverMutation = useMutation({
    mutationFn: (id: number) => filesApi.setCover(id),
    onSuccess: () => { success('Cover updated'); qc.invalidateQueries({ queryKey }); },
    onError: () => toastError('Failed to set cover'),
  });

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setUploading(true);
    try {
      for (const file of list) {
        const form = new FormData();
        form.append('file', file);
        form.append('referenceId', String(referenceId));
        form.append('referenceType', referenceType);
        form.append('fileType', 'image');
        form.append('isCover', String((images as any[]).length === 0));
        await filesApi.upload(form);
      }
      qc.invalidateQueries({ queryKey });
      success(`${list.length} image${list.length > 1 ? 's' : ''} uploaded`);
    } catch (e: any) {
      toastError(e?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) upload(e.target.files);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
  };

  return (
    <div className="space-y-4">
      {/* Existing images grid */}
      {(images as any[]).length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {(images as any[]).map((img: any) => (
            <div key={img.id} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
              <img
                src={img.url.startsWith('http') ? img.url : `http://localhost:4000${img.url}`}
                alt=""
                className="w-full h-full object-cover"
              />
              {/* Cover badge */}
              {img.isCover && (
                <div className="absolute top-1.5 start-1.5 bg-yellow-400 text-yellow-900 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5" /> Cover
                </div>
              )}
              {/* Overlay actions */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {!img.isCover && (
                  <button
                    onClick={() => coverMutation.mutate(img.id)}
                    disabled={coverMutation.isPending}
                    title="Set as cover"
                    className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center hover:bg-yellow-300 transition-colors"
                  >
                    <Star className="w-3.5 h-3.5 text-yellow-900" />
                  </button>
                )}
                <button
                  onClick={() => deleteMutation.mutate(img.id)}
                  disabled={deleteMutation.isPending}
                  title="Delete"
                  className="w-7 h-7 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
          dragging ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50',
          uploading && 'pointer-events-none opacity-60',
        )}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            <p className="text-sm text-gray-500">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
              {dragging ? <Upload className="w-5 h-5 text-primary-500" /> : <ImageIcon className="w-5 h-5 text-gray-400" />}
            </div>
            <p className="text-sm font-medium text-gray-700">
              Drop images here or <span className="text-primary-600">browse</span>
            </p>
            <p className="text-xs text-gray-400">PNG, JPG, WEBP up to 10MB · select multiple</p>
          </div>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFileChange} />
    </div>
  );
}
