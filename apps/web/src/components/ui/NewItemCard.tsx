import { Plus } from 'lucide-react';
import { cx } from '../../utils/cx';

export interface NewItemCardProps {
  onClick: () => void;
  collapsed?: boolean;
  label: string;
}

export function NewItemCard({ onClick, collapsed, label }: NewItemCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'group w-full border-b border-border/50 border-l-2 border-l-transparent transition-colors duration-150 hover:bg-primary/15',
        collapsed ? 'flex justify-center px-0 py-3' : 'px-3 py-3 text-left',
      )}
    >
      <div className={cx('flex items-center gap-2.5', collapsed && 'justify-center')}>
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border transition-colors duration-150 group-hover:border-primary"
          title={label}
        >
          <Plus className="h-4 w-4 text-muted-foreground transition-colors duration-150 group-hover:text-foreground" />
        </div>
        {!collapsed && <span className="text-sm text-muted-foreground/50 transition-colors duration-150 group-hover:text-muted-foreground">{label}</span>}
      </div>
    </button>
  );
}
