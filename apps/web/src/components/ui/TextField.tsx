import React from 'react';
import { inputCls } from './styles';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  inputClassName?: string;
  className?: string;
  id?: string;
}

/**
 * Labeled text input with the app's standard field styling. Used across
 * settings and detail forms in place of per-file duplicate field markup.
 */
export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  inputClassName,
  className,
  id,
}: TextFieldProps) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm text-muted-foreground">
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName ?? inputCls}
      />
    </div>
  );
}
