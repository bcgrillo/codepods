/** Supported git hosting provider types. Extend this as new adapters are added. */
export type GitProviderType = 'github' | 'gitlab';

export interface CreateRepoOptions {
  /** PAT or access token for the provider API. */
  token: string;
  /** Repository name. Use `org/name` convention to create in an organization. */
  repoName: string;
  /** Whether the repo should be private. */
  private: boolean;
  /** Optional default branch name (provider default if omitted). */
  defaultBranch?: string;
}

export interface CreateRepoResult {
  /** Clean clone URL (no embedded credentials). */
  url: string;
  /** Default branch of the newly created repo. */
  defaultBranch: string;
  /** Human-readable full name (e.g. "user/repo" or "org/repo"). */
  fullName: string;
}

/** Adapter interface for git hosting providers. Implement one per provider. */
export interface GitProviderAdapter {
  readonly type: GitProviderType;
  /** Create a new repository on the provider and return its clone URL. */
  createRepo(opts: CreateRepoOptions): Promise<CreateRepoResult>;
}