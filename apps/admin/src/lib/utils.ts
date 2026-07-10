import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'USD', locale = 'en'): string {
  // -u-nu-latn forces Western digits even for ar (which otherwise defaults to
  // Arabic-Indic numerals) — standard practice for financial UI.
  return new Intl.NumberFormat(`${locale}-u-nu-latn`, { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
}

export function formatDate(date: string | Date, locale = 'en'): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(date));
}

export function formatDatetime(date: string | Date, locale = 'en'): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date));
}

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
};

export function getTranslation(translations: any[], langCode = 'en') {
  return translations?.find((t) => t.languageCode === langCode) || translations?.[0];
}

export function debounce<T extends (...args: any[]) => any>(fn: T, delay = 300) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
