/**
 * A "source" of skills. Three kinds:
 * - `local`: the built-in, per-codepod local skills directory (auto-discovered,
 *   uploaded by the user). Not deletable, not editable git fields.
 * - `repo`: a remote git repository that *contains* many skills (each a
 *   subfolder with a `SKILL.md`). `subPath` optionally narrows to a folder.
 * - `skill`: a remote git repository that *is* a single skill (`SKILL.md` at
 *   the repo root, or inside `subPath`).
 */
export type SkillSourceType = 'local' | 'repo' | 'skill';

export const SKILL_SOURCE_TYPES: SkillSourceType[] = ['local', 'repo', 'skill'];

/** A skill source as exposed by the API. */
export interface SkillSource {
  id: number;
  codepodId: number;
  name: string;
  type: SkillSourceType;
  /** Remote git URL (repo / skill). `null` for the local source. */
  gitUrl: string | null;
  /** Folder within the repo to scan (repo type) or where SKILL.md lives (skill type). */
  subPath: string | null;
  /** Git ref (default 'main'). */
  branch: string | null;
  /** Last synced commit SHA — used to decide when to re-scan. */
  commitSha: string | null;
  lastSyncedAt: string | null;
  enabled: boolean;
  /** True for the built-in local source (not deletable). */
  builtIn: boolean;
  /** Local filesystem directory the local source scans (local only). */
  localDir: string | null;
  /** Count of discovered skills (convenience for list views). */
  skillCount: number;
  /** Pin/order: 0 = unpinned, 1+ = pinned position. */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillSourceDto {
  name: string;
  type: SkillSourceType;
  gitUrl?: string;
  subPath?: string;
  branch?: string;
  enabled?: boolean;
}

export interface UpdateSkillSourceDto {
  name?: string;
  gitUrl?: string;
  subPath?: string;
  branch?: string;
  enabled?: boolean;
}