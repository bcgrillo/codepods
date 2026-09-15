import { Check, Loader2, Save } from 'lucide-react';

interface SaveButtonProps {
  onSave: () => void;
  /** Whether there are unsaved changes (enables the button). */
  dirty: boolean;
  saving?: boolean;
  saved?: boolean;
  saveLabel?: string;
  savedLabel?: string;
  className?: string;
}

/**
 * Save button with the app's dirty/loading/saved states. Disabled and muted
 * when not dirty, shows a spinner while saving, and a checkmark + "saved"
 * label briefly after a successful save.
 */
export function SaveButton({
  onSave,
  dirty,
  saving = false,
  saved = false,
  saveLabel = 'Save',
  savedLabel = 'Saved',
  className,
}: SaveButtonProps) {
  const icon = saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />;
  const label = saved ? savedLabel : saveLabel;
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={!dirty || saving}
      className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors ${
        dirty ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'cursor-not-allowed bg-secondary-item text-muted-foreground'
      } ${className ?? ''}`}
    >
      {icon}
      {label}
    </button>
  );
}
