import { Loader2 } from 'lucide-react';

export interface ChoiceCard {
  id: string;
  /** Optional icon node (TemplateIcon, letter fallback, etc.) */
  icon?: React.ReactNode;
  title: string;
  /** Optional secondary text */
  description?: string;
  /** Dashed border style for "custom / manual" tiles */
  dashed?: boolean;
  /** Disable the card (non-clickable, dimmed) */
  disabled?: boolean;
}

export interface ChoiceGridProps {
  cards: ChoiceCard[];
  /** Fired when a card is clicked — the parent decides what to do (advance, select, etc.) */
  onSelect: (id: string) => void;
  /** Optional: highlight the card with this id */
  selectedId?: string | null;
  /** Desktop column count. 1 = vertical list. Default 3. */
  columns?: number;
  /** Card inner layout: centered (icon on top) or horizontal (icon on left). Default 'centered'. */
  cardLayout?: 'centered' | 'horizontal';
  loading?: boolean;
  emptyHint?: string;
  /** Show more / less toggle */
  collapseAt?: number;
  showAll?: boolean;
  onToggleShowAll?: () => void;
  showMoreLabel?: string;
  showLessLabel?: string;
}

export function ChoiceGrid({
  cards,
  onSelect,
  selectedId,
  columns = 3,
  cardLayout = 'centered',
  loading,
  emptyHint,
  collapseAt,
  showAll = false,
  onToggleShowAll,
  showMoreLabel,
  showLessLabel,
}: ChoiceGridProps) {
  const hasMore = collapseAt !== undefined && cards.length > collapseAt;
  const visibleCards = hasMore && !showAll ? cards.slice(0, collapseAt) : cards;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (cards.length === 0 && emptyHint) {
    return <p className="py-8 text-center text-xs text-muted-foreground">{emptyHint}</p>;
  }

  // 1-column = vertical list (space-y), otherwise grid
  // Map to static Tailwind classes (dynamic strings are purged in production)
  const gridClsMap: Record<number, string> = {
    1: 'space-y-2',
    2: 'grid grid-cols-2 gap-2',
    3: 'grid grid-cols-2 gap-2 sm:grid-cols-3',
    4: 'grid grid-cols-2 gap-2 sm:grid-cols-4',
  };
  const gridCls = gridClsMap[columns] ?? gridClsMap[3];

  return (
    <div>
      <div className={gridCls}>
        {visibleCards.map((card) => {
          const isSelected = selectedId != null && card.id === selectedId;
          const base = card.dashed
            ? 'border-dashed border-border bg-transparent hover:border-primary hover:bg-primary/10'
            : isSelected
              ? 'border-primary bg-primary/10'
              : 'border-border bg-secondary-item/50 hover:border-primary hover:bg-primary/10';

          const disabledCls = card.disabled ? ' cursor-not-allowed opacity-40' : '';
          const cardCls = cardLayout === 'horizontal'
            ? `flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors${disabledCls} ${base}`
            : `flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors${disabledCls} ${base}`;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => !card.disabled && onSelect(card.id)}
              disabled={card.disabled}
              className={cardCls}
            >
              {cardLayout === 'horizontal' ? (
                <div className="flex-1">
                  <div className={isSelected ? 'text-sm font-medium text-primary-soft' : 'text-sm font-medium text-foreground'}>
                    {card.title}
                  </div>
                  {card.description && (
                    <div className="text-xs text-muted-foreground">{card.description}</div>
                  )}
                </div>
              ) : (
                <>
                  {card.icon && (
                    <div className="flex h-12 w-12 items-center justify-center">
                      {card.icon}
                    </div>
                  )}
                  <span className="w-full truncate text-xs font-medium text-foreground">{card.title}</span>
                  {card.description && (
                    <span className="w-full line-clamp-2 text-[10px] text-muted-foreground">{card.description}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
      {hasMore && onToggleShowAll && (
        <button
          type="button"
          onClick={onToggleShowAll}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded py-1.5 text-xs text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft"
        >
          {showAll ? showLessLabel : showMoreLabel}
        </button>
      )}
    </div>
  );
}