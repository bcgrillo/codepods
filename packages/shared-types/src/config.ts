export interface AgentsMd {
  id: number;
  codepodId: number;
  alias: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentsMdDto {
  alias: string;
  content: string;
  isDefault?: boolean;
}

export interface UpdateAgentsMdDto {
  alias?: string;
  content?: string;
  isDefault?: boolean;
}

/**
 * A central (marketplace) git repository used to discover resources.
 * `cachedRef` is a hidden value managed internally by the backend recording
 * the last synced git ref (branch / commit) of the cached clone.
 */
export interface CentralRepoConfig {
  url: string;
  branch: string;
  cachedRef: string;
}

/**
 * Docker run configuration applied to every agent container at creation time.
 * A snapshot of the current values is stored per-agent so each agent remembers
 * how it was started even if the global config changes later.
 */
export interface DockerRunConfig {
  /** `--rm` — ephemeral agents: container auto-removed on stop, DB record deleted. */
  autoRemove: boolean;
  /** `--read-only` — root filesystem mounted read-only. */
  readOnly: boolean;
  /** `--tmpfs /tmp:size=` — tmpfs mount for /tmp. Empty string = disabled. */
  tmpfsSize: string;
  /** `--cap-drop=ALL` — drop all Linux capabilities. */
  capDropAll: boolean;
  /** `--cap-drop=NET_RAW` — drop raw packet sending (ARP spoofing, IP spoofing).
   *  Default true. When capDropAll is true, this is redundant but harmless.
   *  Disabling weakens agent identification — only for debugging. */
  dropNetRaw: boolean;
  /** `--security-opt no-new-privileges` — prevent privilege escalation. */
  noNewPrivileges: boolean;
  /** `--pids-limit N` — max number of processes. null = disabled. */
  pidsLimit: number | null;
  /** `--memory` — memory limit (e.g. `512m`). Empty = disabled. */
  memoryLimit: string;
  /** `--cpus` — CPU limit (e.g. 1 = 1 CPU). 0 = disabled. */
  cpuLimit: number;
  /** `--runtime=runsc` — container runtime (gVisor). Empty = default. */
  runtime: string;
  /** `--user` — when true, run the agent as a dedicated per-agent logical uid (random
   *  in `agentUidRange`) and grant it POSIX ACL access to home + workspace. When false,
   *  the agent runs as the API process's own uid (experimental, native writes, no ACL). */
  forceNonRootUser: boolean;
  /** Inclusive range for per-agent logical uids (default 55001-65000). Random assignment
   *  with collision check against existing `agentUid` values in the DB. */
  agentUidRange: { start: number; end: number };
  /** Extra raw docker args (stored + logged, not auto-parsed into dockerode options). */
  customArgs: string;
}

/**
 * Network security configuration for agent egress filtering and
 * agent-to-host authentication.
 *
 * `filterInternetEgress` controls internet filtering only — the agent network
 * (internal, CAP_NET_RAW drop, iptables) and the API proxy (agent identity
 * injection) are always active regardless of this setting.
 */
export interface NetworkSecurityConfig {
  /** Filter outbound internet traffic from agent containers through the
   *  egress proxy with a domain whitelist. When false, internet traffic is
   *  allowed without filtering, but the agent network + API proxy remain. */
  filterInternetEgress: boolean;
  /** Whitelist of allowed sites (one per row). Use specific service domains. */
  egressWhitelist: string[];
  /** Port the egress proxy listens on (reachable by agents via host-gateway). */
  proxyPort: number;
}

/**
 * Git security configuration for the CodePods git proxy.
 *
 * Controls what git operations agents can perform through the proxy, and
 * provides optional credential reuse for sub-repositories cloned inside a
 * workspace.
 */
export interface GitSecurityConfig {
  /** When true, inject the main workspace repo's credential helper into
   *  `git clone` of sub-repositories inside the workspace. Only works if the
   *  stored token has access to the target repo. */
  reuseMainRepoCredentials: boolean;
  /** Whitelist of git subcommands allowed through the proxy. Replaces the
   *  hardcoded default list. */
  commandWhitelist: string[];
  /** Block `git config` without `--local`. Prevents agents from modifying the
   *  global ~/.gitconfig, which affects ALL workspaces on this instance. */
  blockGlobalConfig: boolean;
  /** Block `git push --force` and `--force-with-lease` to any branch. */
  blockForcePush: boolean;
  /** Branches protected from destructive operations (force-push, branch -D,
   *  reset --hard, push --delete). Empty = no protected branches. */
  protectedBranches: string[];
  /** Block `git remote add/remove`. Prevents agents from adding arbitrary
   *  remotes (potential data exfiltration to third parties). */
  blockRemoteManagement: boolean;
}

export interface CodepodsConfigDto {
  dataDir: string;
  port: number;
  corsOrigin: string | boolean;
  swaggerEnabled: boolean;
  publicUrl: string;
  buildKit: boolean;
  gitUserName: string;
  gitUserEmail: string;
  useGenericGitIdentity: boolean;
  templateRepositories: CentralRepoConfig[];
  providerRepositories: CentralRepoConfig[];
  tlsEnabled: boolean;
  tlsCertPath: string;
  tlsKeyPath: string;
  tlsPort: number;
  docker: DockerRunConfig;
  networkSecurity: NetworkSecurityConfig;
  gitSecurity: GitSecurityConfig;
}