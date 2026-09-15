import React from 'react';
import { Loader2 } from 'lucide-react';

interface IconButtonProps {
  onClick: () => void;
  /** Shows a spinner in place of the icon and disables the button. */
  loading?: boolean;
  icon: React.ReactNode;
  title: string;
  /** Extra hover/color classes (e.g. "hover:bg-primary/15 hover:text-primary-soft"). */
  hover?: string;
}

/**
 * Small square icon-only button with a tooltip. Used for inline row actions
 * (edit, save, cancel, test, …) across the detail pages.
 */
export function IconButton({ onClick, loading, icon, title, hover }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={title}
      className={`rounded p-1.5 text-muted-foreground transition-colors disabled:opacity-60 ${hover ?? ''}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    </button>
  );
}
