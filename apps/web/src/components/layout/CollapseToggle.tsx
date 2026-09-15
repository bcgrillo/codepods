import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from '../../utils/cx';

interface CollapseToggleProps {
  expanded: boolean;
  onToggle: () => void;
  title: string;
}

/**
 * Small rounded rectangular button that sits over the right divider of a
 * side menu. It fades in when the mouse is over the divider edge and fades
 * out (to transparent) otherwise.
 */
export function CollapseToggle({ expanded, onToggle, title }: CollapseToggleProps) {
  return (
    <div className="absolute top-0 right-0 h-full w-3 group/edge z-10">
      <button
        type="button"
        onClick={onToggle}
        title={title}
        className={cx(
          'absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2',
          'flex h-6 w-5 items-center justify-center rounded-md border border-border bg-secondary-item text-muted-foreground',
          'opacity-0 transition-opacity duration-200 group-hover/edge:opacity-100 hover:text-foreground hover:border-border',
        )}
      >
        {expanded ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
