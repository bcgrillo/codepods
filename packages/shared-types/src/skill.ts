/** A discovered/managed skill (local or remote). */
export interface Skill {
  id: number;
  codepodId: number;
  /** Owning source id. */
  sourceId: number;
  /** Source type, denormalized for convenience. */
  sourceType: 'local' | 'repo' | 'skill';
  /** Skill name (folder name, or uploaded name). */
  name: string;
  /** Description parsed from SKILL.md frontmatter (nullable). */
  description: string | null;
  /** Relative path within the source (subfolder for repo, filename for loose .md). */
  path: string | null;
  /** Cached SKILL.md content (local skills + synced remote skills). */
  skillMd: string | null;
  /** True for local skills the user uploaded (vs auto-discovered). */
  uploaded: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Body for uploading a local skill from a .md or .zip file. */
export interface UploadLocalSkillDto {
  /** Skill name (folder name). */
  name: string;
}

export interface RenameSkillDto {
  name: string;
}