import Link from 'next/link';
import Image from 'next/image';
import { Calendar, ArrowRight } from 'lucide-react';
import { getTranslation, formatDate, truncate } from '@/lib/utils';

interface BlockCardProps {
  block: any;
  locale: string;
  category: string;
}

export function BlockCard({ block, locale, category }: BlockCardProps) {
  const translation = getTranslation(block.translations || [], locale);
  const cover = block.files?.find((f: any) => f.isCover) || block.files?.[0];

  return (
    <Link
      href={`/${locale}/${category}/${translation?.slug || block.id}`}
      className="card group block hover:shadow-md transition-shadow duration-200"
    >
      {/* Cover image */}
      <div className="relative h-48 bg-gray-100 overflow-hidden">
        {cover?.url ? (
          <Image
            src={cover.url}
            alt={translation?.name || ''}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200" />
        )}
        {block.startDate && (
          <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1 flex items-center gap-1.5 text-xs text-gray-700">
            <Calendar className="w-3 h-3" />
            {formatDate(block.startDate, locale)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-bold text-gray-900 text-base mb-2 line-clamp-2 group-hover:text-primary-600 transition-colors">
          {translation?.name || 'Untitled'}
        </h3>
        {translation?.brief && (
          <p className="text-gray-500 text-sm line-clamp-3 mb-4">{translation.brief}</p>
        )}
        <span className="text-primary-600 text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
          Read More <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}
