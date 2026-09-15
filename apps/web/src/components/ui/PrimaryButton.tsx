import type { ReactNode } from 'react';

interface PrimaryButtonProps {
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Primary call-to-action button. Solid primary background, lightens on hover.
 * Used for "Next", "Submit", "Save" etc. across all create flows and wizards.
 */
export function PrimaryButton({
  onClick,
  type = 'button',
  disabled = false,
  children,
  className,
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
    >
      {children}
    </button>
  );
}