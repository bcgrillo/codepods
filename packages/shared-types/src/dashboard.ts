/** System-wide resource stats for the dashboard. */
export interface SystemStats {
  /** Host CPU usage percentage (0-100). */
  cpuPercent: number;
  /** Used memory in bytes. */
  memUsed: number;
  /** Total memory in bytes. */
  memTotal: number;
  /** Used disk in bytes (for the Docker data root / main partition). */
  diskUsed: number;
  /** Total disk in bytes. */
  diskTotal: number;
  /** Number of running codepods agent containers. */
  agentCount: number;
  /** Total number of containers (including non-codepods, if shown). */
  containerCount: number;
}

/** Per-agent resource stats from Docker. */
export interface AgentStats {
  agentId: string;
  agentName: string;
  status: string;
  /** CPU usage percentage (0-100). */
  cpuPercent: number;
  /** Memory usage in bytes. */
  memUsed: number;
  /** Memory limit in bytes. */
  memLimit: number;
  /** Disk usage — container writable layer size (SizeRw) in bytes.
   *  Undefined when the container no longer exists (removed but agent still in DB). */
  diskUsed?: number;
  /** Container virtual size (SizeRootFs = image + writable layer) in bytes.
   *  Undefined when the container no longer exists. */
  diskTotal?: number;
  /** Number of processes in the container. */
  processCount: number;
  /** Container image name. */
  image: string;
  /** Workspace directory size in bytes (if agent has a linked workspace). */
  workspaceSize?: number;
  /** True if multiple agents share the same workspace. */
  workspaceShared?: boolean;
  /** Agent home directory size in bytes. */
  homeSize?: number;
  /** Total disk footprint = diskTotal + workspaceSize + homeSize. */
  totalSize?: number;
  /** True for non-codepods containers merged into the stats table. */
  isExternal?: boolean;
  /** Real Docker container name (may differ from agentName). */
  containerName?: string;
  /** Full Docker container ID (64 chars). agentId is the 12-char short form. */
  containerFullId?: string;
}

/** Sortable metrics for the agent stats view. */
export type AgentStatsSortBy = 'cpu' | 'mem' | 'disk' | 'processes' | 'total';

/** Container info for non-codepods containers (optional toggle). */
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  cpuPercent: number;
  memUsed: number;
  memLimit: number;
  /** Container writable layer size in bytes. */
  diskUsed: number;
  /** Container virtual size (image + writable) in bytes. */
  diskTotal: number;
  processCount: number;
  isCodepods: boolean;
}

/** A workspace with no agent linked in the DB (no agent references it at all).
 *
 *  Distinct from workspaces with a stopped agent — those are not considered
 *  orphaned because the agent still exists and may be restarted.
 *  A future enhancement may add a 'stopped agent' cleanup category.
 */
export interface OrphanedWorkspace {
  workspaceId: number;
  name: string;
  slug: string;
  type: string;
  /** Workspace directory size in bytes (excluding .git). */
  size: number;
  /** Whether the git repo has uncommitted changes. */
  gitDirty: boolean;
  /** Whether the git repo has unpushed commits. */
  gitAhead: boolean;
  /** Number of agents (stopped) that reference this workspace. */
  stoppedAgentCount: number;
}

/** A Docker image not referenced by any container (running or stopped).
 *  These are safe candidates for `docker rmi` cleanup. */
export interface UnusedDockerImage {
  /** Full Docker image ID (sha256:...). */
  id: string;
  /** First repository:tag, or '<none>' if untagged. */
  imageRef: string;
  /** Image size in bytes (matches `docker images` SIZE column). */
  size: number;
}

/** A home directory on disk with no corresponding agent in the DB.
 *
 *  Homes live at `<dataDir>/homes/<agentId>` and have no DB entity of their
 *  own — they are 1:1 with agent records. An orphaned home is a directory
 *  whose agentId doesn't match any agent in the DB (agent was deleted but
 *  the directory wasn't cleaned up, or creation failed mid-way).
 *
 *  A future enhancement may add a 'stopped agent home' category for homes
 *  whose agent exists in the DB but is stopped (softer cleanup candidate).
 */
export interface OrphanedHome {
  /** The agentId encoded in the directory name. */
  agentId: string;
  /** Host path to the home directory. */
  path: string;
  /** Size of the directory in bytes (recursive). */
  size: number;
}

/** Cleanup check result. */
export interface CleanupCheckResult {
  /** Workspaces with no agent linked in the DB. */
  orphanedWorkspaces: OrphanedWorkspace[];
  /** Home directories on disk with no agent in the DB. */
  orphanedHomes: OrphanedHome[];
  /** Docker images not used by any container. */
  unusedDockerImages: UnusedDockerImage[];
}