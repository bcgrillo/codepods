/**
 * Reorder DTO — accepts an ordered list of entity IDs.
 * The server assigns each entity a sequential sortOrder (1-based) matching
 * the array position. A single batch endpoint per resource accepts this shape.
 *
 * IDs are strings for agents (Docker container IDs) and numbers for all other
 * entities (image templates, ai providers, workspaces).
 */
export interface ReorderDto {
  ids: (string | number)[];
}