import React from 'react';

interface InfoFieldProps {
  label: string;
  /** When true the value keeps its own typography (an editable control). */
  editing?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * A label above an arbitrary value, used by the workspace/provider detail
 * grids. Unlike `Field` (create forms) the value is usually read-only text, so
 * it gets the `text-sm` reading size instead of the control size.
 */
export function InfoField({ label, editing, className, children }: InfoFieldProps) {
  return (
    <div className={`min-w-0 space-y-1 ${className ?? ''}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className={editing ? 'min-w-0' : 'min-w-0 text-sm text-foreground'}>{children}</div>
    </div>
  );
}
