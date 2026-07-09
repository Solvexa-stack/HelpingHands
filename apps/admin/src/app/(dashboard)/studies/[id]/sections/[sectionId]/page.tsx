'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft, Upload, Trash2, FileText, Image, File, Download, Save, Loader2,
} from 'lucide-react';
import { studiesApi } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { useLanguage } from '@/contexts/language-context';
import { useAuth } from '@/contexts/auth-context';

const SECTION_STATUSES = ['pending', 'in_progress', 'completed', 'needs_revision'];

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:4000/api';

function FileIcon({ fileType }: { fileType: string }) {
  if (fileType === 'image') return <Image className="w-4 h-4 text-blue-500" />;
  if (fileType === 'pdf') return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-gray-400" />;
}

export default function SectionEditPage({
  params,
}: {
  params: { id: string; sectionId: string };
}) {
  const studyId = Number(params.id);
  const sectionId = Number(params.sectionId);
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const { t, locale } = useLanguage();

  const secName = (s: any) =>
    (locale === 'ar' && s?.nameAr) ? s.nameAr :
    (locale === 'fr' && s?.nameFr) ? s.nameFr :
    s?.name ?? '';

  const secDesc = (s: any) =>
    (locale === 'ar' && s?.descriptionAr) ? s.descriptionAr :
    (locale === 'fr' && s?.descriptionFr) ? s.descriptionFr :
    s?.description ?? '';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');
  const [dirty, setDirty] = useState(false);

  const { data: study, isLoading } = useQuery({
    queryKey: ['study', studyId],
    queryFn: () => studiesApi.get(studyId),
  });

  const section = study?.sections?.find((s: any) => s.id === sectionId);

  // Backend allows section updates by platform administrators, org_admins of
  // the owning organization, and the assigned admin
  const { user, activeOrg, workspaceType } = useAuth();
  const isAdmin = user?.admin?.role === 'administrator';
  // Org-workspace tenancy only surfaces the org's own studies, so the active
  // org is the study's owning org there
  const isOrgAdmin = workspaceType === 'organization' && (activeOrg?.roles?.includes('org_admin') ?? false);
  const canEdit = isAdmin || isOrgAdmin || (!!section?.assignedTo && section.assignedTo === user?.referenceId);

  useEffect(() => {
    if (section && !dirty) {
      setContent(section.content || '');
      setStatus(section.status || 'pending');
    }
  }, [section]);

  const saveMutation = useMutation({
    mutationFn: () =>
      studiesApi.updateSection(sectionId, { content, status }),
    onSuccess: () => {
      success(t('studies.section.save'));
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['study', studyId] });
    },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => studiesApi.deleteSectionFile(fileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study', studyId] });
    },
    onError: (err: any) => toastError(err?.response?.data?.message || 'Delete failed'),
  });

  const [uploading, setUploading] = useState(false);
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('files', f));
      await studiesApi.uploadSectionFiles(sectionId, formData);
      qc.invalidateQueries({ queryKey: ['study', studyId] });
    } catch (err: any) {
      toastError(err?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">{t('common.loading')}</div>;
  }
  if (!section) {
    return <div className="py-20 text-center text-gray-400">{t('studies.section.notFound')}</div>;
  }

  const files = section.files || [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/studies/${studyId}`} className="btn-ghost btn-sm p-1.5 rounded-lg">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="page-title">{secName(section)}</h1>
            <p className="text-sm text-gray-400">
              #{section.order}{section.isRequired ? ` · ${t('studies.section.required')}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !dirty || !canEdit}
          className="btn-primary btn-md gap-2"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {t('studies.section.save')}
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Editor (left) */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">{t('studies.section.content')}</h2>

          {!canEdit && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 leading-relaxed">
              {t('studies.section.notAssigned')}
              {section.assignedAdmin && (
                <span className="font-medium"> — {section.assignedAdmin.firstName} {section.assignedAdmin.lastName}</span>
              )}
            </div>
          )}

          {secDesc(section) && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700 leading-relaxed">
              <p className="font-medium mb-1">{t('studies.section.guidance')}</p>
              <p>{secDesc(section)}</p>
            </div>
          )}

          {/* Status dropdown */}
          <div>
            <label className="label">{t('studies.section.status')}</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setDirty(true); }}
              disabled={!canEdit}
              className="input"
            >
              {SECTION_STATUSES.map((s) => (
                <option key={s} value={s}>{t(`studies.sectionStatus.${s}`) || s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {/* Content textarea */}
          <div className="flex-1">
            <label className="label">{t('studies.section.content')}</label>
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setDirty(true); }}
              onBlur={() => { if (dirty && canEdit) saveMutation.mutate(); }}
              readOnly={!canEdit}
              rows={18}
              className="input resize-none font-mono text-sm"
              placeholder={t('studies.section.contentPlaceholder')}
            />
          </div>
        </div>

        {/* Files (right) */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">{t('studies.section.filesTitle')}</h2>

          {/* Upload zone */}
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-primary-400 hover:bg-primary-50/30 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleUpload(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,video/mp4"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2 text-primary-600">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm font-medium">{t('studies.section.uploading')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <Upload className="w-8 h-8" />
                <p className="text-sm font-medium text-gray-600">{t('studies.section.uploadDrop')}</p>
                <p className="text-xs">{t('studies.section.uploadTypes')}</p>
              </div>
            )}
          </div>

          {/* File list */}
          {files.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('studies.section.noFiles')}</p>
          ) : (
            <div className="space-y-2">
              {files.map((f: any) => (
                <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors group">
                  <FileIcon fileType={f.fileType} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{f.name}</p>
                    <p className="text-xs text-gray-400">{f.fileType} · {formatDate(f.createdAt)}</p>
                  </div>

                  {f.fileType === 'image' && (
                    <a
                      href={f.url.startsWith('http') ? f.url : `${API_URL.replace('/api', '')}${f.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"
                    >
                      <img
                        src={f.url.startsWith('http') ? f.url : `${API_URL.replace('/api', '')}${f.url}`}
                        alt={f.name}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  )}

                  <div className="flex gap-1 flex-shrink-0">
                    <a
                      href={f.url.startsWith('http') ? f.url : `${API_URL.replace('/api', '')}${f.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost btn-sm p-1.5 rounded-lg text-gray-400 hover:text-primary-600"
                      title={t('common.actions')}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => deleteMutation.mutate(f.id)}
                      disabled={deleteMutation.isPending}
                      className="btn btn-sm bg-red-50 text-red-500 hover:bg-red-100 p-1.5 rounded-lg"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
