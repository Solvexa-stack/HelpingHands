import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Target, TrendingUp } from 'lucide-react';
import { ProgressBar } from '@/components/ui/progress-bar';
import { cn, formatCurrency, getTranslation } from '@/lib/utils';

interface ProjectCardProps {
  project: any;
  locale: string;
  className?: string;
}

export function ProjectCard({ project, locale, className }: ProjectCardProps) {
  const translation = getTranslation(project.block?.translations || [], locale);
  const coverFile = project.block?.files?.[0];
  const progression = Number(project.progression || 0);
  const isCompleted = project.isCompleted;

  return (
    <Link href={`/${locale}/projects/${project.id}`} className={cn('card group block hover:shadow-md transition-shadow duration-200', className)}>
      {/* Image */}
      <div className="relative h-48 bg-gray-100 overflow-hidden">
        {coverFile?.url ? (
          <Image
            src={coverFile.url}
            alt={translation?.name || 'Project'}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
            <Target className="w-12 h-12 text-primary-400" />
          </div>
        )}
        {/* Status badge */}
        <div className="absolute top-3 end-3">
          <span className={cn('badge text-xs', isCompleted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>
            {isCompleted ? 'Completed' : 'Active'}
          </span>
        </div>
        {/* Category badge */}
        <div className="absolute top-3 start-3">
          <span className="badge bg-white/90 text-gray-700 capitalize text-xs backdrop-blur-sm">
            {project.category}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-bold text-gray-900 text-lg mb-1 line-clamp-2 group-hover:text-primary-600 transition-colors">
          {translation?.name || 'Unnamed Project'}
        </h3>

        {translation?.brief && (
          <p className="text-gray-500 text-sm mb-4 line-clamp-2">{translation.brief}</p>
        )}

        {/* Location */}
        {project.location && (
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-4">
            <MapPin className="w-3.5 h-3.5" />
            <span>{project.location}</span>
          </div>
        )}

        {/* Progress */}
        <ProgressBar value={progression} size="md" className="mb-3" />

        <div className="flex justify-between text-sm">
          <div>
            <p className="text-gray-400 text-xs">Collected</p>
            <p className="font-bold text-primary-600">{formatCurrency(project.collectedAmount || 0, undefined, locale)}</p>
          </div>
          <div className="text-end">
            <p className="text-gray-400 text-xs">Target</p>
            <p className="font-bold text-gray-700">{formatCurrency(Number(project.value), undefined, locale)}</p>
          </div>
          <div className="text-end">
            <p className="text-gray-400 text-xs">Progress</p>
            <p className="font-bold text-gray-700">{progression.toFixed(1)}%</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
