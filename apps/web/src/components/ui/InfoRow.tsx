import React from 'react';

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  /** Width of the label column (default "w-24"). */
  labelWidth?: string;
}

/**
 * A label + mono value row used in detail "definition" grids. The label
 * column is fixed-width so values align across rows.
 */
export function InfoRow({ label, value, labelWidth = 'w-24' }: InfoRowProps) {
  return (
    <div className="flex gap-4">
      <span className={`flex-shrink-0 text-xs text-muted-foreground ${labelWidth}`}>{label}</span>
      <span className="truncate font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}
