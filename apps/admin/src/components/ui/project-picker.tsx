'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { projectsApi } from '@/lib/api';
import { useLanguage } from '@/contexts/language-context';
import { cn, debounce, getTranslation } from '@/lib/utils';

interface PickedProject {
  id: number;
  name: string;
}

/**
 * Searchable project dropdown, scoped to an organization when one is given.
 * Stores/returns the numeric projectId; the visible text is the resolved
 * (localized) project name from block.translations.
 */
export function ProjectPicker({
  organizationId,
  value,
  onChange,
  className = 'input',
}: {
  organizationId?: number;
  value: number | '';
  onChange: (project: PickedProject) => void;
  className?: string;
}) {
  const { t, locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clear the picker's own text when the parent resets `value` externally
  // (e.g. after a successful submit clears the form).
  useEffect(() => {
    if (value === '') {
      setQuery('');
      setSelectedLabel('');
    }
  }, [value]);

  const debouncedSetQuery = useMemo(() => debounce((v: string) => setDebouncedQuery(v), 300), []);
  useEffect(() => {
    debouncedSetQuery(query);
  }, [query, debouncedSetQuery]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['project-picker', organizationId ?? null, debouncedQuery, locale],
    queryFn: () =>
      projectsApi.list({
        ...(organizationId != null ? { organizationId } : {}),
        ...(debouncedQuery ? { search: debouncedQuery } : {}),
        limit: 20,
        lang: locale,
      }),
    enabled: open,
  });

  const projects: PickedProject[] = (data?.data ?? []).map((p: any) => ({
    id: p.id,
    name: getTranslation(p.block?.translations, locale)?.name ?? `#${p.id}`,
  }));

  useEffect(() => {
    setHighlightedIndex(0);
  }, [projects.length, debouncedQuery]);

  const select = (project: PickedProject) => {
    onChange(project);
    setSelectedLabel(project.name);
    setQuery(project.name);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlightedIndex((i) => Math.min(i + 1, projects.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const project = projects[highlightedIndex];
      if (project) select(project);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const activeId = projects[highlightedIndex] ? `project-picker-option-${projects[highlightedIndex].id}` : undefined;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls="project-picker-listbox"
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          className={cn(className, 'ps-8')}
          placeholder={t('funds.propose.projectSearchPlaceholder')}
          value={query || selectedLabel}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedLabel('');
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <ul
          id="project-picker-listbox"
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg text-sm"
        >
          {isLoading && (
            <li className="flex items-center gap-2 px-3 py-2 text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('common.loading')}
            </li>
          )}
          {isError && (
            <li className="flex items-center justify-between gap-2 px-3 py-2 text-red-600 dark:text-red-400">
              <span>{t('funds.propose.loadProjectsError')}</span>
              <button type="button" className="underline shrink-0" onClick={() => refetch()}>
                {t('common.retry')}
              </button>
            </li>
          )}
          {!isLoading && !isError && projects.length === 0 && (
            <li className="px-3 py-2 text-gray-500">{t('funds.propose.noProjectsFound')}</li>
          )}
          {!isLoading &&
            !isError &&
            projects.map((project, i) => (
              <li
                key={project.id}
                id={`project-picker-option-${project.id}`}
                role="option"
                aria-selected={value === project.id}
                className={cn(
                  'px-3 py-2 cursor-pointer',
                  i === highlightedIndex ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800',
                )}
                onMouseEnter={() => setHighlightedIndex(i)}
                onMouseDown={(e) => { e.preventDefault(); select(project); }}
              >
                {project.name}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
