import type { ReactNode } from 'react';

interface SecondaryButtonProps {
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Secondary (outlined) button — muted surface, foreground text. Used for "Back",
 * "Close", "Cancel" etc. across all create flows and wizards.
 */
export function SecondaryButton({
  onClick,
  type = 'button',
  disabled = false,
  children,
  className,
}: SecondaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1 rounded border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary-item disabled:opacity-50 ${className ?? ''}`}
    >
      {children}
    </button>
  );
}