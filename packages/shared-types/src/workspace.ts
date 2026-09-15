export type WorkspaceType = 'local' | 'remote';

/** Supported git hosting provider types for new-remote repo creation. */
export type GitProviderType = 'github' | 'gitlab';

export interface Workspace {
  id: number;
  codepodId: number;
  slug: string;
  name: string;
  type: WorkspaceType;
  remoteUrl: string | null;
  credentialId: number | null;
  credentialLabel: string | null;
  path: string;
  branch: string | null;
  /** Manual sort order (drag-and-drop). 0 = no forced order (alphabetical fallback). */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Inline credential creation when creating a workspace. Host is deduced from remoteUrl. */
export interface InlineWorkspaceCredential {
  username: string;
  token: string;
  /** Optional custom label; defaults to username (auto-suffixed on collision). */
  label?: string;
}

export interface CreateWorkspaceDto {
  /** Display name. If omitted, deduced from remoteUrl (remote) or slug. */
  name?: string;
  /** Internal slug. If omitted, deduced from remoteUrl (remote) or name. Auto-suffixed on collision. */
  slug?: string;
  type: WorkspaceType;
  remoteUrl?: string;
  /** Use an existing credential. */
  credentialId?: number | null;
  /** Create a new credential inline (host deduced from remoteUrl). */
  credential?: InlineWorkspaceCredential;
  codepodId?: number;

  /** New-remote: create a new repo on the provider before cloning. */
  gitProvider?: GitProviderType;
  /** New-remote: repo name (`name` or `org/name` convention). */
  repoName?: string;
  /** New-remote: whether the repo should be private. */
  repoPrivate?: boolean;
  /** Copy the default AGENTS.md file into the workspace after creation. */
  copyAgentsMd?: boolean;
  /** Specific AGENTS.md version to copy (defaults to the default version when omitted). */
  agentsMdId?: number | null;
}

export interface UpdateWorkspaceDto {
  name?: string;
  type?: WorkspaceType;
  remoteUrl?: string | null;
  credentialId?: number | null;

  /** New-remote conversion: create a new repo on the provider and push. */
  gitProvider?: GitProviderType;
  repoName?: string;
  repoPrivate?: boolean;
}

/** Live repository inspection data (from git commands). */
export interface WorkspaceRepoInfo {
  branch: string | null;
  head: {
    hash: string | null;
    shortHash: string | null;
    message: string | null;
    author: string | null;
    /** ISO date of the last commit. */
    date: string | null;
  };
  lastTag: string | null;
  remotes: { name: string; url: string }[];
  /** True if the working tree has uncommitted changes. */
  dirty: boolean;
  /** Commits ahead of upstream, if an upstream is configured. */
  ahead: number | null;
  /** Commits behind upstream, if an upstream is configured. */
  behind: number | null;
}

/** Result of a remote connection test (git ls-remote). */
export interface WorkspaceTestResult {
  ok: boolean;
  message: string | null;
  latencyMs: number;
}

// --- File management ---

export interface WorkspaceFileEntry {
  name: string;
  /** Relative path from workspace root (posix-style, no leading slash). */
  path: string;
  type: 'file' | 'dir';
  size: number;
  modified: string;
}

export type UploadOverwriteMode = 'error' | 'replace' | 'backup';

export interface UploadResult {
  ok: true;
  written: string[];
  overwritten: { name: string; backup: string }[];
}

// --- Git management ---

export interface GitFileChange {
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '??';
  path: string;
  oldPath?: string;
}

export interface GitStatus {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: GitFileChange[];
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
}

export interface GitBranchesResult {
  local: GitBranch[];
  remote: GitBranch[];
}

export interface GitStashResult {
  ok: true;
  message: string;
  stashes: number;
}

export interface GitCommitResult {
  ok: true;
  hash: string;
  shortHash: string;
  message: string;
}

export interface GitSyncResult {
  ok: true;
  pulled: number;
  pushed: number;
  message: string;
}