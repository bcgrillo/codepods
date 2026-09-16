import { isValidElement, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, ChevronRight, ChevronUp, Pin, PinOff, SquareArrowOutUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type StatusType = 'active' | 'inactive' | 'warning' | 'error' | 'custom';

const FORWARD_REF = Symbol.for('react.forward_ref');
const MEMO = Symbol.for('react.memo');

/** Detects forwardRef/memo wrappers (objects, not plain functions). */
function isComponentLike(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (Symbol.keyFor((value as { $$typeof: symbol }).$$typeof) === Symbol.keyFor(FORWARD_REF) ||
      Symbol.keyFor((value as { $$typeof: symbol }).$$typeof) === Symbol.keyFor(MEMO))
  );
}

/**
 * `icon` accepts either a lucide icon component (original mock API) or an
 * arbitrary ReactNode (e.g. a template-specific icon). When a ReactNode is
 * passed it is rendered directly inside the icon box, so callers control its
 * sizing/tint.
 */
export interface SecondaryItem {
  id: string;
  icon: LucideIcon | ReactNode | ComponentType<{ className?: string }>;
  label: string;
  secondary?: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'success' | 'gold' | 'outline';
  status?: StatusType;
  statusColor?: string;
  groupId?: string;
  pinned?: boolean;
  /** Extra classes applied to the icon box (e.g. status rings, pulse). */
  iconBoxClassName?: string;
}

export interface SecondaryGroup {
  id: string;
  label: string;
  defaultCollapsed?: boolean;
}

export interface ContextMenuAction {
  id: string;
  label: string;
  /** Icon element rendered left of the label. */
  icon?: ReactNode;
  /** Color/shading variant for the menu item. */
  variant?: 'default' | 'destructive' | 'success' | 'warning';
  disabled?: boolean;
  /** When set the item opens this URL in a NEW WINDOW **with** the CodePods frame (in-app route, e.g. /agents/:name/:service). */
  href?: string;
  /** Optional right-side icon that opens `externalHref` in a new window WITHOUT the CodePods frame (raw proxy URL). */
  externalHref?: string;
  /** Tooltip for the external-link icon. */
  externalTitle?: string;
  /** Legacy alias kept for callers that only differentiate destructive. */
  destructive?: boolean;
  /** Runs on item select. Mutations handled by callers. */
  onClick?: () => void;
}

export interface SecondaryListProps {
  items: SecondaryItem[];
  groups?: SecondaryGroup[];
  selectedId?: string | null;
  newItemLabel?: string;
  onSelect?: (id: string) => void;
  onPin?: (id: string, pinned: boolean) => void;
  onReorder?: (pinnedIds: string[]) => void;
  onGroupToggle?: (groupId: string, collapsed: boolean) => void;
  onNew?: () => void;
  contextMenuActions?: (item: SecondaryItem) => ContextMenuAction[];
  /** When true, render a compact icon-only column (no labels, no DnD). */
  collapsed?: boolean;
}

export function StatusDot({ status, statusColor, collapsed }: { status: StatusType; statusColor?: string; collapsed?: boolean }) {
  const colorClass =
    status === 'active'
      ? 'text-emerald-400 dark:text-emerald-500'
      : status === 'inactive'
        ? 'text-slate-400 dark:text-slate-400'
        : status === 'warning'
          ? 'text-amber-400 dark:text-amber-500'
          : status === 'error'
            ? 'text-red-400 dark:text-red-500'
            : undefined;

  return (
    <span
      className={cn(
        collapsed
          ? 'block h-1 w-1 rounded-full shrink-0 bg-current shadow-[0_0_6px] shadow-current/80 dark:shadow-current'
          : 'block h-2 w-2 rounded-full shrink-0 bg-current shadow-[0_0_6px] shadow-current/80 dark:shadow-current',
        colorClass,
      )}
      style={status === 'custom' && statusColor ? { color: statusColor } : undefined}
      aria-hidden="true"
    />
  );
}

function ItemIcon({
  icon,
  selected,
}: {
  icon: LucideIcon | ReactNode | ComponentType<{ className?: string }>;
  selected: boolean;
}) {
  if (!isValidElement(icon) && (typeof icon === 'function' || isComponentLike(icon))) {
    const Icon = icon as ComponentType<{ className?: string }>;
    return (
      <Icon
      className={cn('h-4 w-4 transition-colors', selected ? 'text-foreground' : 'text-foreground/70')}
      />
    );
  }
  // ReactNode (custom icon) — rendered as-is; tint is handled by the icon box.
  return <>{icon}</>;
}

/** Variant → icon/text shading. Mirrors ActionButton/btn-icon hover conventions. */
const CONTEXT_MENU_ACTION_STYLES: Record<NonNullable<ContextMenuAction['variant']>, string> = {
  // Default items use the primary nav's soft effect: muted gray before hover,
  // soft primary tint on hover/keyboard focus (NOT the solid accent tone).
  default:
    'text-foreground/70 [&_svg:not([fill=none])]:opacity-70 data-[highlighted]:bg-primary/15 data-[highlighted]:text-primary-soft data-[highlighted]:[&_svg:not([fill=none])]:opacity-100',
  success: 'text-emerald-600 dark:text-emerald-500 data-[highlighted]:text-emerald-600 dark:data-[highlighted]:text-emerald-500 data-[highlighted]:bg-emerald-500/10',
  warning: 'text-amber-600 dark:text-amber-500 data-[highlighted]:text-amber-600 dark:data-[highlighted]:text-amber-500 data-[highlighted]:bg-amber-500/10',
  destructive: 'text-destructive data-[highlighted]:text-destructive data-[highlighted]:bg-destructive/10',
};

/**
 * Renders the actions passed via `contextMenuActions` inside a
 * `ContextMenuContent`. Supports separators (`__separator__`), icons,
 * per-variant shading, `href` items (open in new window WITH the frame),
 * `externalHref` (right-side icon opening WITHOUT the frame) and
 * `onClick` mutations. Uses radix's canonical `onSelect` so the item both
 * fires and closes the menu.
 */
function ContextMenuItems({ actions }: { actions: ContextMenuAction[] }) {
  return (
    <>
      {actions.map((action, idx) => {
        if (action.id === '__separator__') {
          return <ContextMenuSeparator key={idx} />;
        }
        return (
          <ContextMenuItem
            key={action.id}
            disabled={action.disabled}
            onSelect={() => {
              // Radix v2's onSelect fires for both click and keyboard activation.
              // NOTE: NOT calling event.preventDefault() here — doing so would
              // skip radix's internal onClose() and leave the menu open.
              if (action.href) {
                window.open(action.href, '_blank', 'noopener,noreferrer');
              }
              action.onClick?.();
            }}
            className={cn(
              // Labels never wrap: the menu widens instead of breaking lines.
              'gap-2 [&_span]:whitespace-nowrap',
              action.variant ? CONTEXT_MENU_ACTION_STYLES[action.variant] : CONTEXT_MENU_ACTION_STYLES.default,
              // External "open without frame" action (kept for legacy callers).
              !action.variant && action.externalHref && 'text-foreground/70 [&_svg:not([fill=none])]:opacity-70',
            )}
          >
            {action.icon}
            <span className="min-w-0 flex-1 truncate">{action.label}</span>
            {action.externalHref && (
              <span
                role="button"
                tabIndex={0}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/80 transition-colors hover:bg-primary/15 hover:text-primary-soft"
                title={action.externalTitle}
                onClick={(e: { stopPropagation: () => void; preventDefault: () => void }) => {
                  // The menu item's onSelect fires from the parent's click
                  // handler; stop propagation so only the external action runs.
                  e.stopPropagation();
                  e.preventDefault();
                  window.open(action.externalHref, '_blank', 'noopener,noreferrer');
                }}
              >
                <SquareArrowOutUpRight className="h-3.5 w-3.5" />
              </span>
            )}
          </ContextMenuItem>
        );
      })}
    </>
  );
}

interface CardShellProps {
  item: SecondaryItem;
  selected: boolean;
  isOverlay?: boolean;
  setNodeRef: (node: HTMLElement | null) => void;
  attributes?: DraggableAttributes;
  listeners?: DraggableSyntheticListeners;
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null;
  transition?: string;
  isDragging: boolean;
  onSelect: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  menuActions?: ContextMenuAction[];
}

function CardShell({
  item,
  selected,
  isOverlay,
  setNodeRef,
  attributes,
  listeners,
  transform,
  transition,
  isDragging,
  onSelect,
  onPin,
  menuActions,
}: CardShellProps) {
  const hasStatus = Boolean(item.status);
  const actions = menuActions ?? [];

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const card = (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(item.id)}
      className={cn(
        'group/card relative flex items-center gap-3 rounded-lg border py-2.5 text-sm select-none transition-colors',
        isOverlay ? 'cursor-grabbing' : 'cursor-pointer',
        'min-h-12',
        'pl-3',
        'pr-7',
        selected
          ? 'border-primary-soft bg-primary/15 text-primary-soft ring-1 ring-primary/20 hover:bg-primary/15'
          : 'border-border bg-secondary-item text-foreground hover:border-primary/30 hover:bg-primary/15 hover:text-primary-soft',
      )}
    >
      <div className={cn('flex items-center shrink-0', 'gap-3')}>
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors',
            selected
              ? 'border-primary-soft bg-primary/10'
              : 'border-border bg-muted/50 text-foreground/70 [&_svg:not([fill=none])]:opacity-70 [&_img]:opacity-70 group-hover/card:border-primary/30 group-hover/card:bg-primary/10 group-hover/card:text-primary-soft group-hover/card:[&_svg:not([fill=none])]:opacity-100 group-hover/card:[&_img]:opacity-100',
            item.iconBoxClassName,
          )}
        >
          <ItemIcon icon={item.icon} selected={selected} />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{item.label}</span>
          {item.badge && (
            <Badge variant={item.badgeVariant ?? 'secondary'} className="shrink-0 px-1.5 py-0 text-[10px]">
              {item.badge}
            </Badge>
          )}
        </div>
        {item.secondary && <span className="truncate text-xs text-muted-foreground">{item.secondary}</span>}
      </div>

      {hasStatus && (
        <span className="absolute right-2.5 top-2.5">
          <StatusDot status={item.status!} statusColor={item.statusColor} />
        </span>
      )}

      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'absolute bottom-2 right-2 h-3.5 w-3.5 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity',
          'hover:bg-secondary-item-hover hover:text-foreground',
          'group-hover/card:opacity-100 focus-visible:opacity-100',
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onPin(item.id, !item.pinned);
        }}
        aria-label={item.pinned ? 'Unpin item' : 'Pin item'}
        title={item.pinned ? 'Unpin' : 'Pin'}
      >
        {item.pinned ? <PinOff className="h-2.5 w-2.5" /> : <Pin className="h-2.5 w-2.5" />}
      </Button>
    </div>
  );

  if (actions.length === 0) return card;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
      <ContextMenuContent className="w-auto min-w-[16rem] max-w-[24rem]">
        <ContextMenuItems actions={actions} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface CardDragProps {
  item: SecondaryItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  menuActions?: ContextMenuAction[];
}

function SortableCard({ item, selected, onSelect, onPin, menuActions }: CardDragProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <CardShell
      item={item}
      selected={selected}
      isOverlay={isDragging}
      setNodeRef={setNodeRef}
      attributes={attributes}
      listeners={listeners}
      transform={transform}
      transition={transition}
      isDragging={isDragging}
      onSelect={onSelect}
      onPin={onPin}
      menuActions={menuActions}
    />
  );
}

function StaticCard({ item, selected, onSelect, onPin, menuActions }: CardDragProps) {
  return (
    <CardShell
      item={item}
      selected={selected}
      setNodeRef={() => {}}
      transform={null}
      isDragging={false}
      onSelect={onSelect}
      onPin={onPin}
      menuActions={menuActions}
    />
  );
}

interface NewCardProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

function NewCard({ label, selected, onClick }: NewCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-primary/15',
        selected
          ? 'border-primary-soft border-solid bg-primary/15 text-primary-soft'
          : 'border-border border-dashed bg-secondary-item text-muted-foreground hover:border-primary/30 hover:bg-primary/15 hover:text-primary-soft',
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors',
          selected
            ? 'border-primary-soft border-solid bg-primary/10'
            : 'border-border border-dashed bg-muted/50 group-hover:border-primary/30 group-hover:bg-primary/10',
        )}
      >
        <Plus className={cn('h-4 w-4 transition-colors', selected ? 'text-foreground' : 'text-muted-foreground')} />
      </div>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function CompactButton({
  item,
  selected,
  onSelect,
  menuActions,
}: {
  item: SecondaryItem;
  selected: boolean;
  onSelect: (id: string) => void;
  menuActions?: ContextMenuAction[];
}) {
  const hasMenu = Boolean(menuActions && menuActions.length > 0);

  const button = (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
        selected
          ? 'border-primary-soft bg-primary/15 text-primary-soft'
          : 'border-border text-foreground/70 [&_svg:not([fill=none])]:opacity-70 [&_img]:opacity-70 hover:bg-primary/15 hover:text-primary-soft hover:[&_svg:not([fill=none])]:opacity-100 hover:[&_img]:opacity-100',
      )}
      aria-current={selected ? 'page' : undefined}
    >
      {item.status && (
        <span className="absolute right-1 top-1">
          <StatusDot status={item.status} statusColor={item.statusColor} collapsed />
        </span>
      )}
      <ItemIcon icon={item.icon} selected={selected} />
    </button>
  );

  const trigger = hasMenu ? (
    <TooltipTrigger asChild>
      <ContextMenuTrigger asChild>
        {button}
      </ContextMenuTrigger>
    </TooltipTrigger>
  ) : (
    <TooltipTrigger asChild>
      {button}
    </TooltipTrigger>
  );

  if (!hasMenu) {
    return (
      <Tooltip>
        {trigger}
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <ContextMenu>
      <Tooltip>
        {trigger}
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
      <ContextMenuContent className="w-auto min-w-[16rem] max-w-[24rem]">
        <ContextMenuItems actions={menuActions ?? []} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function SecondaryList({
  items,
  groups = [],
  selectedId,
  newItemLabel = 'New',
  onSelect,
  onPin,
  onReorder,
  onGroupToggle,
  onNew,
  contextMenuActions,
  collapsed,
}: SecondaryListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [groupCollapsed, setGroupCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of groups) init[g.id] = g.defaultCollapsed ?? false;
    return init;
  });

  const pinned = useMemo(() => items.filter((i) => i.pinned), [items]);
  const grouped = useMemo(() => {
    const map: Record<string, SecondaryItem[]> = {};
    const ungrouped: SecondaryItem[] = [];
    for (const item of items) {
      if (item.pinned) continue;
      if (item.groupId && map[item.groupId]) map[item.groupId].push(item);
      else if (item.groupId) map[item.groupId] = [item];
      else ungrouped.push(item);
    }
    return { map, ungrouped };
  }, [items]);

  // Local override for the pinned order. After a DnD drop, we immediately
  // set the new order locally so the list doesn't flash back to the old
  // order while the parent propagates the optimistic cache update.
  const propPinnedIds = useMemo(() => pinned.map((i) => i.id), [pinned]);
  const [localPinnedIds, setLocalPinnedIds] = useState<string[] | null>(null);
  const pinnedIds = localPinnedIds ?? propPinnedIds;
  // Re-sync to prop-derived order whenever it changes (e.g. new items,
  // pin/unpin, backend refetch).
  useEffect(() => {
    setLocalPinnedIds(null);
  }, [propPinnedIds.join(',')]);

  // Render pinned items in the (potentially locally-overridden) order.
  const orderedPinned = useMemo(() => {
    if (!localPinnedIds) return pinned;
    const byId = new Map(pinned.map((i) => [i.id, i]));
    return localPinnedIds
      .map((id) => byId.get(id))
      .filter((i): i is SecondaryItem => Boolean(i));
  }, [pinned, localPinnedIds]);

  const { setNodeRef: setPinnedZoneRef, isOver: isOverPinnedZone } = useDroppable({
    id: '__pinned-zone__',
  });
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = () => setIsDragging(true);
  const handleDragOver = (event: DragOverEvent) => {
    setDragOverId(event.over ? String(event.over.id) : null);
  };
  const stopDragging = () => {
    setIsDragging(false);
    setDragOverId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    stopDragging();
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const from = pinnedIds.indexOf(activeId);
    const to = pinnedIds.indexOf(overId);
    if (from === -1 || to === -1 || activeId === overId) return;
    const next = arrayMove(pinnedIds, from, to);
    setLocalPinnedIds(next);
    onReorder?.(next);
  };

  const handleGroupToggle = (groupId: string, open: boolean) => {
    setGroupCollapsed((prev) => ({ ...prev, [groupId]: !open }));
    onGroupToggle?.(groupId, !open);
  };

  if (collapsed) {
    const collapsedUngrouped = items.filter((i) => !i.groupId);
    const collapsedGroupMap: Record<string, SecondaryItem[]> = {};
    for (const item of items) {
      if (item.groupId) {
        if (!collapsedGroupMap[item.groupId]) collapsedGroupMap[item.groupId] = [];
        collapsedGroupMap[item.groupId].push(item);
      }
    }
    return (
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <div className="flex flex-col items-center gap-1 py-2">
          {onNew && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onNew()}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
                    selectedId === '__new__'
                      ? 'border-primary-soft border-solid bg-primary/15 text-primary-soft'
                      : 'border-border border-dashed text-muted-foreground hover:bg-primary/15 hover:text-primary-soft',
                  )}
                  aria-label={newItemLabel}
                >
                  <Plus className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{newItemLabel}</TooltipContent>
            </Tooltip>
          )}
          {collapsedUngrouped.map((item) => (
            <CompactButton
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onSelect={(id) => onSelect?.(id)}
              menuActions={contextMenuActions?.(item)}
            />
          ))}
          {groups.map((group) => {
            const groupItems = collapsedGroupMap[group.id] ?? [];
            if (groupItems.length === 0) return null;
            const isOpen = !groupCollapsed[group.id];
            const selectedInGroup = groupItems.find((i) => i.id === selectedId);
            return (
              <div key={group.id} className="flex flex-col items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleGroupToggle(group.id, !isOpen)}
                      className={cn(
                        'relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft',
                        !isOpen && 'border border-border',
                      )}
                      aria-label={group.label}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <span className="text-sm font-semibold">{groupItems.length}</span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{group.label}</TooltipContent>
                </Tooltip>
                {isOpen &&
                  groupItems.map((item) => (
                    <CompactButton
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      onSelect={(id) => onSelect?.(id)}
                      menuActions={contextMenuActions?.(item)}
                    />
                  ))}
                {/* Group collapsed but one of its items is selected: show it as a
                    single revealed button below the group, without opening it. */}
                {!isOpen && selectedInGroup && (
                  <CompactButton
                    key={selectedInGroup.id}
                    item={selectedInGroup}
                    selected
                    onSelect={(id) => onSelect?.(id)}
                    menuActions={contextMenuActions?.(selectedInGroup)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 overflow-hidden p-2">
      {onNew && <NewCard label={newItemLabel} selected={selectedId === '__new__'} onClick={() => onNew()} />}

      {pinned.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={stopDragging}
        >
          <SortableContext items={pinnedIds} strategy={verticalListSortingStrategy}>
            <div
              ref={setPinnedZoneRef}
              className={cn(
                'rounded-lg border border-transparent transition-colors',
                '-ml-[calc(var(--spacing)*1+1px)] -mr-[calc(var(--spacing)*1+1px)]',
                '-mt-[calc(calc(var(--spacing)*1+1px))] -mb-[calc(calc(var(--spacing)*1+1px))]',
                'flex flex-col gap-1.5 px-1 py-1',
                (isDragging || isOverPinnedZone || dragOverId) && 'bg-primary/5 border-primary-soft',
              )}
            >
              {orderedPinned.map((item) => (
                <SortableCard
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  onSelect={(id) => onSelect?.(id)}
                  onPin={(id, p) => onPin?.(id, p)}
                  menuActions={contextMenuActions?.(item)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-col gap-1.5">
        {grouped.ungrouped.map((item) => (
          <StaticCard
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            onSelect={(id) => onSelect?.(id)}
            onPin={(id, p) => onPin?.(id, p)}
            menuActions={contextMenuActions?.(item)}
          />
        ))}

        {groups.map((group) => {
          const groupItems = grouped.map[group.id] ?? [];
          if (groupItems.length === 0) return null;
          const isOpen = !groupCollapsed[group.id];
          const selectedInGroup = groupItems.find((i) => i.id === selectedId);
          return (
            <div key={group.id} className="flex flex-col">
              <Collapsible open={isOpen} onOpenChange={(open) => handleGroupToggle(group.id, open)}>
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
                    <span>{group.label}</span>
                    <span className="ml-auto text-[10px]">{groupItems.length}</span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-1.5">
                  {groupItems.map((item) => (
                    <StaticCard
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      onSelect={(id) => onSelect?.(id)}
                      onPin={(id, p) => onPin?.(id, p)}
                      menuActions={contextMenuActions?.(item)}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
              {/* Group collapsed but one of its items is selected: show it as a
                  single revealed card below the header, without opening the group. */}
              {!isOpen && selectedInGroup && (
                <StaticCard
                  key={selectedInGroup.id}
                  item={selectedInGroup}
                  selected
                  onSelect={(id) => onSelect?.(id)}
                  onPin={(id, p) => onPin?.(id, p)}
                  menuActions={contextMenuActions?.(selectedInGroup)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}