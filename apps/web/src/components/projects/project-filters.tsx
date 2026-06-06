'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, Filter } from 'lucide-react';
import { useCallback, useState } from 'react';

const categories = ['agricultural', 'industrial', 'trading'];

export function ProjectFilters({ locale }: { locale: string }) {
  const t = useTranslations('projects');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter('search', search);
  };

  const activeCategory = searchParams.get('category') || '';
  const isCompleted = searchParams.get('isCompleted');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search')}
            className="input pl-10 pr-4"
          />
        </form>

        {/* Category filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => updateFilter('category', '')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              !activeCategory ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('filters.all')}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => updateFilter('category', cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                activeCategory === cat ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t(`filters.${cat}` as any)}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          <button
            onClick={() => updateFilter('isCompleted', isCompleted === 'false' ? '' : 'false')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isCompleted === 'false' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('filters.inProgress')}
          </button>
          <button
            onClick={() => updateFilter('isCompleted', isCompleted === 'true' ? '' : 'true')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isCompleted === 'true' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('filters.completed')}
          </button>
        </div>
      </div>
    </div>
  );
}
