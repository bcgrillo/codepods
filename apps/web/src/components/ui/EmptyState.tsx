import React from 'react';

interface EmptyStateProps {
  message: string;
  icon?: React.ReactNode;
  /** Wrapper classes. Defaults to the standard list padding. */
  className?: string;
}

/**
 * Consistent "no content here yet" placeholder used in list and section
 * bodies. Renders muted text with an optional icon above it.
 */
export function EmptyState({ message, icon, className = 'px-4 py-4' }: EmptyStateProps) {
  return (
    <div className={className}>
      {icon && <div className="mb-2 flex justify-center text-muted-foreground/50">{icon}</div>}
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
