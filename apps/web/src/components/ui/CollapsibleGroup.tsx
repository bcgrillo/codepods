import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cx } from '../../utils/cx';

interface CollapsibleGroupProps {
  /** i18n label for the group button, e.g. t('agents.disconnected') */
  label: string;
  /** Number of items in the group */
  count: number;
  /** Whether any item in this group is currently selected (keeps group visible) */
  hasSelected: boolean;
  /** Render the selected item (shown even when collapsed) */
  renderSelectedItem: () => React.ReactNode;
  /** Render all items in the group (shown when expanded) */
  renderAllItems: () => React.ReactNode;
  collapsed?: boolean;
}

/**
 * Collapsible group for inactive/disconnected/disabled items.
 * When count > threshold, shows a button instead of all items.
 * If an item in the group is selected, it stays visible even when collapsed.
 */
export function CollapsibleGroup({
  label,
  count,
  hasSelected,
  renderSelectedItem,
  renderAllItems,
  collapsed,
}: CollapsibleGroupProps) {
  const [expanded, setExpanded] = useState(false);

  // Auto-collapse when the selected item leaves the group
  useEffect(() => {
    if (!hasSelected) setExpanded(false);
  }, [hasSelected]);

  // When a selection happens inside the group, collapse the rest
  useEffect(() => {
    if (hasSelected && expanded) setExpanded(false);
  }, [hasSelected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button
        onClick={() => setExpanded((e) => !e)}
        className={cx(
          'w-full flex items-center gap-2.5 text-sm transition-colors border-l-2 border-transparent',
          collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
          'text-muted-foreground hover:text-foreground hover:bg-secondary-item/50',
        )}
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <>
            {expanded ? (
              <ChevronDown className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="truncate flex-1 text-left">{label}</span>
            <span className="text-xs text-muted-foreground/50 flex-shrink-0">{count}</span>
          </>
        )}
      </button>
      {expanded
        ? renderAllItems()
        : hasSelected
          ? renderSelectedItem()
          : null}
    </>
  );
}