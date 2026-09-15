import React from 'react';

import { dangerInputCls } from './styles';

interface DangerConfirmFieldProps {
  /** Prompt, usually an i18n string plus the target name in mono/destructive. */
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * "Type the name to confirm" input used by the destructive sections. Keeps the
 * prompt, the destructive focus ring and the mono placeholder identical in
 * every delete confirmation dialog.
 */
export function DangerConfirmField({ label, value, onChange, placeholder }: DangerConfirmFieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={dangerInputCls}
      />
    </div>
  );
}
