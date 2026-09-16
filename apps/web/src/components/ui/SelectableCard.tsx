import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

export interface SelectableCardProps {
  selected: boolean;
  onClick: () => void;
  collapsed?: boolean;
  /** Visual-only dimming; keeps onClick active to match list-row UX. */
  disabled?: boolean;
  icon: ReactNode;
  iconBoxTitle?: string;
  iconBoxClassName?: string;
  children?: ReactNode;
  className?: string;
}

export function SelectableCard({
  selected,
  onClick,
  collapsed,
  disabled,
  icon,
  iconBoxTitle,
  iconBoxClassName,
  children,
  className,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'w-full border-b border-border/50 transition-colors',
        collapsed ? 'flex justify-center px-0 py-3' : 'px-3 py-3 text-left',
        selected
          ? 'border-l-2 border-l-primary-soft bg-primary/15'
          : 'border-l-2 border-l-transparent hover:bg-primary/15',
        disabled && 'opacity-60',
        className,
      )}
    >
      <div className={cx('flex items-center gap-2.5', collapsed && 'justify-center')}>
        <div
          className={cx(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary-item',
            iconBoxClassName,
          )}
          title={iconBoxTitle}
        >
          {icon}
        </div>
        {!collapsed && children}
      </div>
    </button>
  );
}
