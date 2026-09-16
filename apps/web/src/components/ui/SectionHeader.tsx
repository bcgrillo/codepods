import React from 'react';

interface SectionHeaderProps {
  title: string;
  /** Optional helper text shown under the title. */
  description?: string;
  icon?: React.ReactNode;
  /** 'lg' = text-sm semibold (body sections); 'sm' = uppercase micro-label (group titles). */
  size?: 'lg' | 'sm';
  /** Extra classes merged onto the heading (margins, flex sizing). */
  className?: string;
}

/**
 * Consistent section heading. Use `size="lg"` for a section title (optionally
 * with an icon/description) and `size="sm"` for the uppercase micro-labels that
 * group subsections together. Renders only the heading element (plus an optional
 * description) so it can be dropped into any existing layout without a wrapper.
 */
export function SectionHeader({ title, description, icon, size = 'lg', className }: SectionHeaderProps) {
  if (size === 'sm') {
    return (
      <h2 className={`${className ?? ''} text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        {title}
      </h2>
    );
  }
  const heading = (
    <h2 className={`${className ?? ''} flex items-center gap-2 text-sm font-semibold text-foreground`}>
      {icon}
      {title}
    </h2>
  );
  if (!description) return heading;
  return (
    <div className="space-y-0.5">
      {heading}
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
