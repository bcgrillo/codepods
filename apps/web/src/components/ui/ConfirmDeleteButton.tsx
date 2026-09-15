import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

interface ConfirmDeleteButtonProps {
  /** Fired when the button is clicked while already confirming (final delete). */
  onDelete: () => void;
  /** Whether this row is currently in the confirming state. */
  confirming: boolean;
  /** Called to enter/exit the confirming state. */
  onConfirmToggle: (confirming: boolean) => void;
  pending?: boolean;
  deleteTitle?: string;
  confirmTitle?: string;
  size?: string;
}

/**
 * Destructive delete button with a built-in confirm step: a first click arms
 * the confirm state (red pulse + warning icon), a second click fires
 * `onDelete`. Moving the mouse away resets the confirmation.
 */
export function ConfirmDeleteButton({
  onDelete,
  confirming,
  onConfirmToggle,
  pending = false,
  deleteTitle = 'Delete',
  confirmTitle = 'Confirm',
  size = 'h-3.5 w-3.5',
}: ConfirmDeleteButtonProps) {
  return (
    <button
      type="button"
      onClick={() => (confirming ? onDelete() : onConfirmToggle(true))}
      disabled={pending}
      title={confirming ? confirmTitle : deleteTitle}
      onMouseLeave={() => confirming && onConfirmToggle(false)}
      className={
        'rounded p-1 transition-colors disabled:opacity-50' +
        (confirming
          ? ' bg-destructive/20 text-destructive ring-1 ring-destructive/40 animate-pulse'
          : ' text-muted-foreground hover:bg-destructive/10 hover:text-destructive')
      }
    >
      {pending ? (
        <Loader2 className={`${size} animate-spin`} />
      ) : confirming ? (
        <AlertTriangle className={size} />
      ) : (
        <Trash2 className={size} />
      )}
    </button>
  );
}
