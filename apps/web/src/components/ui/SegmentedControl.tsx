import React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 'sm' = row-level, 'md' = default form control, 'lg' = primary chooser. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  'aria-label'?: string;
}

const sizeCls: Record<NonNullable<SegmentedControlProps<string>['size']>, string> = {
  sm: 'px-2 py-1',
  md: 'px-2.5 py-1',
  lg: 'px-3 py-1.5',
};

/**
 * Horizontal group of mutually-exclusive pill buttons. Replaces the per-file
 * copies of the same active/inactive button styling that used to live in the
 * workspace, AI provider, template and service forms.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
          className={`rounded border text-xs transition-colors disabled:opacity-50 ${sizeCls[size]} ${
            value === opt.value
              ? 'border-primary bg-primary/10 text-primary-soft'
              : 'border-border text-muted-foreground hover:bg-secondary-item'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
