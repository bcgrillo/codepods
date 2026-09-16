import React from 'react';

interface FieldProps {
  label: string;
  /** Optional helper text rendered under the control. */
  hint?: string;
  /** Optional error text (replaces the hint and switches the control border). */
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Generic labeled form field: a small label, an arbitrary control, and an
 * optional hint/error line. Used for selects/custom controls that aren't plain
 * text inputs (those use `TextField`). Centralises the label/hint styling that
 * was previously copy-pasted across the create/detail forms.
 */
export function Field({ label, hint, error, className, children }: FieldProps) {
  return (
    <label className={className ?? 'block space-y-1'}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {error ? (
        <span className="block text-[11px] text-destructive">{error}</span>
      ) : (
        hint && <span className="block text-[11px] text-muted-foreground/70">{hint}</span>
      )}
    </label>
  );
}
