/**
 * Sort items: forced order (sortOrder > 0) first (by sortOrder ASC),
 * then remaining items alphabetically (case-insensitive).
 */
export function sortWithForcedOrder<T extends { sortOrder?: number; name: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao > 0 && bo > 0) return ao - bo;
    if (ao > 0) return -1;
    if (bo > 0) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/** Threshold for collapsing inactive/disconnected items into a group button. */
export const GROUP_COLLAPSE_THRESHOLD = 3;