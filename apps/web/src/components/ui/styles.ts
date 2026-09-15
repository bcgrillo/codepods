/**
 * Shared design tokens for controls that are too small to be full components
 * but must stay visually consistent across the app. Keep these in sync with
 * the primitives in this folder (e.g. `TextField` uses `inputCls`).
 */

/** Standard full-width text input. */
export const inputCls =
  'w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary';

/** Compact inline input for row-level editing (inline in lists/tables). */
export const inputCompactCls =
  'rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary';

/** Text input in the destructive ("type the name to confirm") sections. */
export const dangerInputCls =
  'w-full rounded border border-border bg-secondary-item px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-destructive';

/** Secondary (outlined) button — muted surface, primary text. */
export const secondaryBtnCls =
  'inline-flex flex-shrink-0 items-center gap-1 rounded border border-border px-2.5 py-2 text-xs text-foreground transition-colors hover:bg-secondary-item disabled:opacity-50';
