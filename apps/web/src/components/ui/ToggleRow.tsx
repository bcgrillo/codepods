import React from 'react';
import { ToggleSwitch } from './ToggleSwitch';

interface ToggleRowProps {
  label: string;
  /** Optional helper text shown under the label. */
  hint?: React.ReactNode;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  /** Avatar/badge rendered before the label (brand mark, param chip, …). */
  leading?: React.ReactNode;
  className?: string;
}

/**
 * A settings-style toggle row: label (+ optional hint) on the left, a
 * `ToggleSwitch` on the right. Keeps switch rows visually identical across
 * the general settings and the create/detail forms.
 */
export function ToggleRow({ label, hint, checked, onChange, disabled, leading, className }: ToggleRowProps) {
  return (
    <div className={`flex items-start justify-between gap-3 py-1.5 ${className ?? ''}`}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {leading}
        <div className="min-w-0">
          <span className="text-sm text-foreground">{label}</span>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <div className="flex-shrink-0 pt-0.5">
        <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}
