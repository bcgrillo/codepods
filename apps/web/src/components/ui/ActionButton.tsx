import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

export interface ActionButtonProps {
  onClick?: () => void;
  href?: string;
  loading?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  hoverClass: string;
  active?: boolean;
}

export function ActionButton({
  onClick,
  href,
  loading,
  disabled,
  icon,
  label,
  hoverClass,
  active,
}: ActionButtonProps) {
  const className = cx(
    'inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors disabled:opacity-40',
    active ? 'bg-primary/15 text-primary-soft' : hoverClass,
  );
  const content = loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={label} className={className}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={loading || disabled} title={label} className={className}>
      {content}
    </button>
  );
}
