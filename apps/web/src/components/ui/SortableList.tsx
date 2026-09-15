import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';

interface SortableListProps {
  /** Ordered list of item IDs (string | number) currently rendered. */
  ids: (string | number)[];
  /** Called with the new ordered ID array after a drag-and-drop reorder. */
  onReorder: (newIds: (string | number)[]) => void;
  children: React.ReactNode;
}

/**
 * Wraps children in a DndContext + SortableContext for vertical drag-and-drop
 * reordering. Each child should be wrapped in <SortableItem>.
 * PointerSensor has an activation distance of 6px so clicks still work.
 */
export function SortableList({ ids, onReorder, children }: SortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
