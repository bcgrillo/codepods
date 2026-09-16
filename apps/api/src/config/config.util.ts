import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { CentralRepoConfig, DockerRunConfig, NetworkSecurityConfig, GitSecurityConfig } from '@codepods/shared-types';

/** Default git command whitelist for the proxy. Mirrors the previous
 *  hardcoded GIT_WHITELIST set. Exported so the git-proxy service can use it
 *  as a fallback when the config list is empty. */
export const DEFAULT_GIT_WHITELIST: string[] = [
  'add', 'am', 'annotate', 'archive', 'bisect', 'blame', 'branch',
  'cat-file', 'checkout', 'clean', 'clone', 'commit', 'config',
  'describe', 'diff', 'fetch', 'for-each-ref', 'format-patch', 'grep',
  'hash-object', 'init', 'log', 'ls-files', 'ls-remote', 'merge',
  'merge-base', 'mv', 'notes', 'pull', 'push', 'rebase', 'reflog',
  'remote', 'rename', 'reset', 'restore', 'rev-list', 'rev-parse',
  'revert', 'rm', 'shortlog', 'show', 'stash', 'status', 'submodule',
  'switch', 'symbolic-ref', 'tag', 'update-ref', 'var', 'whatchanged',
  'worktree',
];

export interface CodepodsConfig {
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
  /** When true the API serves HTTPS using the cert/key paths below. */
  tlsEnabled: boolean;
  /** Path to the TLS certificate (PEM). */
  tlsCertPath: string;
  /** Path to the TLS private key (PEM). */
  tlsKeyPath: string;
  /** Port for the HTTPS server when TLS is enabled. */
  tlsPort: number;
  /** Docker run options applied to every agent container. */
  docker: DockerRunConfig;
  /** Network security configuration (egress filtering). */
  networkSecurity: NetworkSecurityConfig;
  /** Git security configuration (proxy restrictions, credential reuse). */
  gitSecurity: GitSecurityConfig;
}

const CONFIG_DIR = path.join(os.homedir(), '.codepods');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

/**
 * Reads the default egress whitelist from the bundled asset file
 * (`default-egress-whitelist.txt`). One domain per line; lines starting with
 * `#` and blank lines are ignored. Falls back to an empty list if the file
 * cannot be read (e.g. running from source without a build step in some envs).
 */
function readDefaultWhitelist(): string[] {
  try {
    const raw = fs.readFileSync(
      path.join(__dirname, 'default-egress-whitelist.txt'),
      'utf8',
    );
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

const DEFAULT_CONFIG: CodepodsConfig = {
  dataDir: path.join(CONFIG_DIR, 'data'),
  port: 3000,
  corsOrigin: true,
  swaggerEnabled: false,
  publicUrl: 'http://localhost:5173',
  buildKit: true,
  gitUserName: '',
  gitUserEmail: '',
  useGenericGitIdentity: false,
  templateRepositories: [
    {
      url: 'https://github.com/lualab-xyz/codepods-templates.git',
      branch: 'main',
      cachedRef: '',
    },
  ],
  providerRepositories: [
    {
      url: 'https://github.com/lualab-xyz/codepods-providers.git',
      branch: 'main',
      cachedRef: '',
    },
  ],
  tlsEnabled: false,
  tlsCertPath: '',
  tlsKeyPath: '',
  tlsPort: 3443,
  docker: {
    autoRemove: false,
    readOnly: true,
    tmpfsSize: '100m',
    capDropAll: true,
    dropNetRaw: true,
    noNewPrivileges: true,
    pidsLimit: 128,
    memoryLimit: '',
    cpuLimit: 0,
    runtime: '',
    forceNonRootUser: true,
    agentUidRange: { start: 55001, end: 65000 },
    customArgs: '',
  },
  networkSecurity: {
    filterInternetEgress: true,
    egressWhitelist: readDefaultWhitelist(),
    proxyPort: 8888,
  },
  gitSecurity: {
    reuseMainRepoCredentials: false,
    commandWhitelist: DEFAULT_GIT_WHITELIST,
    blockGlobalConfig: true,
    blockForcePush: false,
    protectedBranches: ['main', 'dev'],
    blockRemoteManagement: true,
  },
};

/** Returns the fixed config directory (`~/.codepods`). */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/** Returns the config file path (`~/.codepods/config.json`). */
export function getConfigPath(): string {
  return CONFIG_PATH;
}

/**
 * Synchronously loads the config file, creating it with defaults if missing.
 * Called at module-init time (before NestJS DI) so `app.module.ts` can
 * resolve the DB path, and again by `ConfigService` at construction.
 *
 * Env vars override config-file values for Docker/k8s deployments.
 */
export function loadConfigSync(): CodepodsConfig {
  let fileConfig: Partial<CodepodsConfig> = {};

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      console.warn(`[config] Could not parse ${CONFIG_PATH}, using defaults.`);
    }
  } else {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', {
      mode: 0o600,
    });
    console.log(`[config] Created default config at ${CONFIG_PATH}`);
  }

  const merged: CodepodsConfig = { ...DEFAULT_CONFIG, ...fileConfig };

  // Deep-merge nested objects so partial config files don't wipe defaults.
  if (fileConfig.docker) {
    // Migrate the legacy `user` string field to the `forceNonRootUser` boolean:
    // a non-empty user meant "force non-root" was enabled.
    const fileDocker = fileConfig.docker as unknown as Record<string, unknown>;
    if ('user' in fileDocker && !('forceNonRootUser' in fileDocker)) {
      fileDocker.forceNonRootUser = typeof fileDocker.user === 'string' && fileDocker.user.trim() !== '';
      delete fileDocker.user;
    }
    merged.docker = { ...DEFAULT_CONFIG.docker, ...fileConfig.docker };
    // Deep-merge agentUidRange so a partial range (e.g. only start) doesn't wipe end.
    const fileUidRange = (fileConfig.docker as unknown as Record<string, unknown>).agentUidRange;
    if (fileUidRange && typeof fileUidRange === 'object') {
      merged.docker.agentUidRange = {
        ...DEFAULT_CONFIG.docker.agentUidRange,
        ...(fileUidRange as Record<string, number>),
      };
    }
  }
  if (fileConfig.networkSecurity) {
    const fileNet = fileConfig.networkSecurity as unknown as Record<string, unknown>;
    // Migrate: filterEgress → filterInternetEgress
    if ('filterEgress' in fileNet && !('filterInternetEgress' in fileNet)) {
      fileNet.filterInternetEgress = fileNet.filterEgress;
      delete fileNet.filterEgress;
    }
    // Migrate: dropNetRaw moved from networkSecurity → docker
    if ('dropNetRaw' in fileNet) {
      const fileDocker = fileConfig.docker as Record<string, unknown> | undefined;
      if (fileDocker && !('dropNetRaw' in fileDocker)) {
        fileDocker.dropNetRaw = fileNet.dropNetRaw;
      }
      delete fileNet.dropNetRaw;
    }
    merged.networkSecurity = {
      ...DEFAULT_CONFIG.networkSecurity,
      ...fileConfig.networkSecurity,
    };
  }
  if (fileConfig.gitSecurity) {
    merged.gitSecurity = {
      ...DEFAULT_CONFIG.gitSecurity,
      ...fileConfig.gitSecurity,
    };
  }

  if (process.env.DATA_DIR) merged.dataDir = process.env.DATA_DIR;
  if (process.env.PORT) merged.port = parseInt(process.env.PORT, 10);
  if (process.env.CORS_ORIGIN) {
    merged.corsOrigin = process.env.CORS_ORIGIN === 'true' ? true : process.env.CORS_ORIGIN;
  }
  if (process.env.SWAGGER_ENABLED) merged.swaggerEnabled = process.env.SWAGGER_ENABLED !== 'false';
  if (process.env.CODEPODS_PUBLIC_URL) merged.publicUrl = process.env.CODEPODS_PUBLIC_URL;
  if (process.env.DOCKER_BUILDKIT) merged.buildKit = process.env.DOCKER_BUILDKIT !== 'false';
  if (process.env.TLS_ENABLED) merged.tlsEnabled = process.env.TLS_ENABLED !== 'false';
  if (process.env.TLS_CERT_PATH) merged.tlsCertPath = process.env.TLS_CERT_PATH;
  if (process.env.TLS_KEY_PATH) merged.tlsKeyPath = process.env.TLS_KEY_PATH;
  if (process.env.TLS_PORT) merged.tlsPort = parseInt(process.env.TLS_PORT, 10);

  return merged;
}

/** Persists config to the file (without env overrides). */
export function saveConfigSync(config: CodepodsConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}