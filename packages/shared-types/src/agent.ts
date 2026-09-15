import type { ManifestCommand } from './image-template';
import type { DockerRunConfig } from './config';

export type AgentStatus = 'running' | 'stopped' | 'exited' | 'paused' | 'unknown';

export interface PortBinding {
  containerPort: number;
  hostPort: number;
  protocol: 'tcp' | 'udp';
}

export interface Agent {
  id: string;
  /** Full Docker container ID (id is the 12-char short form). */
  containerId?: string;
  name: string;
  image: string;
  status: AgentStatus;
  codepodId: number;
  ports: PortBinding[];
  createdAt: string;
  imageTemplateId?: number | null;
  templateName?: string | null;
  templateIcon?: string | null;
  templateIconDark?: string | null;
  envVars?: Record<string, string> | null;
  commandMeta?: AgentCommandMeta | null;
  templateCommands?: ManifestCommand[] | null;
  creationLog?: string | null;
  /** Associated workspace ID (nullable — not every agent has a workspace). */
  workspaceId?: number | null;
  /** Display name of the associated workspace (null when no workspace). */
  workspaceName?: string | null;
  /** Slug of the associated workspace (null when no workspace). */
  workspaceSlug?: string | null;
  /** In-container path where the workspace is bind-mounted (null when no workspace). */
  workspaceMountPath?: string | null;
  /** Services associated with this agent (included in list responses). */
  services?: AgentService[];
  /** Docker run config snapshot effective at creation time (null for legacy agents). */
  dockerRunConfig?: DockerRunConfig | null;
  /** Host path to the agent's persisted home directory (null if no home). */
  homePath?: string | null;
  /** Per-agent logical uid used as `--user <uid>:<gid>` and for POSIX ACL grants.
   *  Null when the agent runs as the API process's own uid (forceNonRootUser off). */
  agentUid?: number | null;
  /** Per-agent logical gid (same value as agentUid — no separate group). */
  agentGid?: number | null;
  /** In-container path where the home is bind-mounted (from manifest home_path). */
  homeMountPath?: string | null;
  /** Manual sort order (drag-and-drop). 0 = no forced order (alphabetical fallback). */
  sortOrder?: number;
}

export type AgentServiceType = 'terminal' | 'web';

export interface AgentService {
  id: number;
  agentId: string;
  codepodId: number;
  type: AgentServiceType;
  name: string;
  port: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentDto {
  name: string;
  image?: string;
  imageTemplateId?: number;
  updateImageIfOutdated?: boolean;
  /** When true, allow creating the agent even if the template image is outdated. */
  allowOutdatedImage?: boolean;
  codepodId?: number;
  ports?: PortBinding[];
  env?: Record<string, string>;
  /** Optional workspace to bind-mount into the agent container. */
  workspaceId?: number;
}

export interface CreateAgentServiceDto {
  type: AgentServiceType;
  name: string;
  port: number;
}

export interface UpdateAgentServiceDto {
  type?: AgentServiceType;
  name?: string;
  port?: number;
}

export interface UpdateAgentEnvVarsDto {
  envVars: Record<string, string>;
}

export interface RenameAgentDto {
  name: string;
}

export interface AgentCommandMeta {
  set_provider?: {
    providerSlug: string;
    providerName: string;
    providerType: string;
    baseUrl: string;
    modelName: string;
    executedAt: string;
  };
  start_agent?: {
    executedAt: string;
  };
  stop_agent?: {
    executedAt: string;
  };
  set_git_proxy?: {
    executedAt: string;
  };
  add_mcp_server?: {
    mcpServerSlug: string;
    url: string;
    executedAt: string;
  };
  remove_mcp_server?: {
    mcpServerSlug: string;
    executedAt: string;
  };
  get_mcps?: {
    names: string[];
    executedAt: string;
  };
  add_skill?: {
    name: string;
    sourceUrl: string;
    executedAt: string;
  };
  remove_skill?: {
    name: string;
    executedAt: string;
  };
  get_skills?: {
    names: string[];
    executedAt: string;
  };
}

export interface ExecuteAgentCommandResult extends Agent {
  commandOutput?: string;
}

export interface ExecuteAgentCommandDto {
  type:
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
  providerSlug?: string;
  modelName?: string;
  /** MCP server slug — used by add_mcp_server / remove_mcp_server. */
  mcpServerSlug?: string;
  /** Skill name — used by add_skill / remove_skill. */
  skillName?: string;
  /** Skill source URL or path (zip) — used by add_skill. */
  skillSourceUrl?: string;
}

export interface ContainerEnvVars {
  /** All environment variables currently set inside the running container. */
  vars: Record<string, string>;
}

export interface UpdateCreationLogDto {
  creationLog: string;
}

// ---- Agent notices ---------------------------------------------------------

export type AgentNoticeSeverity = 'info' | 'warning' | 'error';

export interface AgentNotice {
  id: number;
  agentId: string;
  severity: AgentNoticeSeverity;
  title: string;
  message: string;
  /** Optional label for an action the user can take (e.g. "Copy command"). */
  actionLabel?: string | null;
  /** Optional action text — typically a shell command the user can run manually. */
  actionText?: string | null;
  createdAt: string;
  dismissedAt?: string | null;
}
