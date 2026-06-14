'use client';

import { useEffect, useState } from 'react';
import { projectsApi, reportsApi } from '@/lib/api';
import { useLanguage } from '@/contexts/language-context';
import { FileText, Sheet, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type ReportKey =
  | 'pdf-summary'
  | 'pdf-financial'
  | 'pdf-progress'
  | 'excel-financial'
  | 'excel-donations'
  | 'excel-expenses';

interface ReportDef {
  key: ReportKey;
  label: string;
  type: 'pdf' | 'excel';
  filename: string;
}

const REPORTS: ReportDef[] = [
  { key: 'pdf-summary', label: 'reports.projectSummary', type: 'pdf', filename: 'project-summary.pdf' },
  { key: 'pdf-financial', label: 'reports.financialReport', type: 'pdf', filename: 'financial-report.pdf' },
  { key: 'pdf-progress', label: 'reports.progressReport', type: 'pdf', filename: 'progress-report.pdf' },
  { key: 'excel-financial', label: 'reports.financialReport', type: 'excel', filename: 'financial-report.xlsx' },
  { key: 'excel-donations', label: 'reports.donationsReport', type: 'excel', filename: 'donations-report.xlsx' },
  { key: 'excel-expenses', label: 'reports.expensesReport', type: 'excel', filename: 'expenses-report.xlsx' },
];

export default function ReportsPage() {
  const { t } = useLanguage();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<ReportKey | null>(null);

  useEffect(() => {
    projectsApi.list({ limit: 100 }).then((data) => {
      setProjects(data?.data || []);
    }).catch(() => { });
  }, []);

  const download = async (report: ReportDef) => {
    if (!selectedProject) return;
    setDownloading(report.key);
    try {
      await reportsApi.download(selectedProject, report.key, report.filename);
    } catch { /* ignore */ } finally {
      setDownloading(null);
    }
  };

  const pdfReports = REPORTS.filter((r) => r.type === 'pdf');
  const excelReports = REPORTS.filter((r) => r.type === 'excel');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('reports.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('reports.subtitle')}</p>
      </div>

      {/* Project Selector */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('reports.selectProject')}
        </label>
        <select
          value={selectedProject || ''}
          onChange={(e) => setSelectedProject(e.target.value ? Number(e.target.value) : null)}
          className="w-full sm:w-96 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">{t('reports.selectProject')}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.block?.translations?.[0]?.name || `Project #${p.id}`}
            </option>
          ))}
        </select>
      </div>

      {!selectedProject && (
        <div className="text-center py-10 text-gray-400 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{t('reports.noProject')}</p>
        </div>
      )}

      {selectedProject && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* PDF Reports */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-red-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">{t('reports.pdfReports')}</h2>
            </div>
            <div className="space-y-3">
              {pdfReports.map((report) => (
                <div key={report.key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-100 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
                      <FileText className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t(report.label)}</span>
                  </div>
                  <button
                    onClick={() => download(report)}
                    disabled={downloading === report.key}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30',
                      downloading === report.key && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {downloading === report.key ? (
                      <><Loader2 className="w-3 h-3 animate-spin" />{t('reports.downloading')}</>
                    ) : (
                      <><Download className="w-3 h-3" />{t('reports.download')}</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Excel Reports */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sheet className="w-5 h-5 text-green-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">{t('reports.excelReports')}</h2>
            </div>
            <div className="space-y-3">
              {excelReports.map((report) => (
                <div key={report.key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                      <Sheet className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t(report.label)}</span>
                  </div>
                  <button
                    onClick={() => download(report)}
                    disabled={downloading === report.key}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30',
                      downloading === report.key && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {downloading === report.key ? (
                      <><Loader2 className="w-3 h-3 animate-spin" />{t('reports.downloading')}</>
                    ) : (
                      <><Download className="w-3 h-3" />{t('reports.download')}</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
