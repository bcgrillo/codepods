import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes}\u00A0B`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)}\u00A0KB`;
  if (bytes < 1000 * 1000 * 1000) return `${(bytes / (1000 * 1000)).toFixed(1)}\u00A0MB`;
  return `${(bytes / (1000 * 1000 * 1000)).toFixed(2)}\u00A0GB`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
