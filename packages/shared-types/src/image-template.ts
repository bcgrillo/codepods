import type { AgentServiceType } from './agent';

export interface ImageTemplateManifestService {
  type: AgentServiceType;
  name: string;
  port: number;
}

export type ManifestCommandType =
  | 'set_provider'
  | 'start_agent'
  | 'stop_agent'
  | 'set_git_proxy'
  | 'add_mcp_server'
  | 'remove_mcp_server'
  | 'get_mcps'
  | 'add_skill'
  | 'remove_skill'
  | 'get_skills';

export interface ManifestCommand {
  type: ManifestCommandType;
  /** Command template with $baseUrl $modelName $apiKey $providerName $providerType placeholders. */
  command: string;
}

export interface ImageTemplateManifest {
  name?: string;
  description?: string;
  icon?: string;
  icon_dark?: string;
  services?: ImageTemplateManifestService[];
  commands?: ManifestCommand[];
  /** In-container path where the agent's workspace is bind-mounted. Default: /workspace */
  workspace_path?: string;
  /** In-container path where the agent's home directory is bind-mounted. Mandatory. */
  home_path: string;
  /** Optional non-root user declared by the manifest (e.g. "agent"). Ignored by
   *  CodePods — agents always run as a per-agent logical uid assigned by the API.
   *  Kept optional for backwards compatibility with manifests that still declare it. */
  user?: string;
  [key: string]: unknown;
}

export interface ImageTemplate {
  id: number;
  codepodId: number;
  repoUrl: string;
  repoPath: string;
  branch: string;
  dockerfiles: string[];
  manifest: ImageTemplateManifest | null;
  name: string;
  description: string | null;
  icon: string | null;
  iconDark: string | null;
  lastBuiltAt: string | null;
  lastBuiltCommit: string | null;
  lastBuiltTag: string | null;
  lastBuiltImageRef: string | null;
  lastBuildOutput: string[];
  enabled: boolean;
  /** Manual sort order (drag-and-drop). 0 = no forced order (alphabetical fallback). */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateImageTemplateDto {
  name?: string;
  repoUrl: string;
  repoPath?: string;
  branch?: string;
  codepodId?: number;
}

export interface UpdateImageTemplateDto {
  name?: string;
  enabled?: boolean;
}
