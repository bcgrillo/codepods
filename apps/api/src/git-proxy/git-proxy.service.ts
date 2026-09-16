import { Injectable, BadRequestException } from '@nestjs/common';
import { spawn, spawnSync } from 'child_process';
import * as path from 'path';
import { AgentsService } from '../agents/agents.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ConfigService } from '../config/config.service';
import { DEFAULT_GIT_WHITELIST } from '../config/config.util';
import type { GitSecurityConfig } from '@codepods/shared-types';

export interface GitExecuteRequest {
  /** Stable agent id (preferred). Sent by the current shim via CODEPODS_AGENT_ID. */
  agentId?: string;
  /** Agent name (legacy). Sent by older shims via CODEPODS_AGENT_NAME. */
  agentName?: string;
  args: string[];
  cwd?: string;
}

export interface GitExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Git global options that take a separate value argument. Their value is not
// the subcommand and must be skipped when extracting the subcommand.
const GIT_GLOBAL_OPTIONS_WITH_VALUE = new Set([
  '-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path',
]);

// Commit-creating commands that require a git identity (user.name + user.email).
const IDENTITY_COMMANDS = new Set(['commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'am']);

/**
 * Extracts the git subcommand, skipping global options (e.g. `-C <dir>`,
 * `--no-pager`, `-c key=value`) so they don't get mistaken for the subcommand.
 * Returns `null` when no subcommand is present (e.g. `git --version`).
 */
function resolveSubcommand(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(arg)) {
      i++; // skip the option's value argument
      continue;
    }
    if (arg.startsWith('-')) continue; // bare global flag
    return arg; // first non-option token is the subcommand
  }
  return null;
}

function blockedCommandMessage(subcommand: string): string {
  return (
    `Git command "${subcommand}" is not allowed through the CodePods git proxy. ` +
    `This agent runs git commands behind a restricted proxy for credential safety, so only a ` +
    `whitelisted subset of git commands is available. If you need this command, ask the CodePods ` +
    `administrator to add it to the whitelist.`
  );
}

function identityErrorMessage(): string {
  return (
    `Please tell me who you are.\n\n` +
    `The CodePods git proxy has no git identity for this agent/workspace. Set one inside the ` +
    `workspace with:\n\n` +
    `  git config user.name "Your Name"\n` +
    `  git config user.email "you@example.com"\n\n` +
    `or configure a generic git identity in the CodePods Settings and enable "Use generic git identity".`
  );
}

@Injectable()
export class GitProxyService {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly workspacesService: WorkspacesService,
    private readonly configService: ConfigService,
  ) {}

  async execute(req: GitExecuteRequest): Promise<GitExecuteResult> {
    if (!req.args || req.args.length === 0) {
      throw new BadRequestException('No git command provided');
    }

    const subcommand = resolveSubcommand(req.args);

    // Info-only invocations (git --version / --help) never touch a workspace
    // and can be passed straight through to real git.
    if (subcommand === null && req.args.every((a) => a.startsWith('-'))) {
      return this.runGit(req.args, process.cwd(), {});
    }

    if (!subcommand) {
      throw new BadRequestException('No git command provided');
    }

    const gitSec = this.configService.getAll().gitSecurity ?? this.defaultGitSecurity();

    if (!this.commandWhitelist(gitSec).has(subcommand)) {
      throw new BadRequestException(blockedCommandMessage(subcommand));
    }

    // Block credential commands — never expose credentials to agents
    if (subcommand === 'credential') {
      throw new BadRequestException('Git credential command is blocked');
    }

    // Block global git config changes (affects ALL workspaces on this instance)
    if (gitSec.blockGlobalConfig && subcommand === 'config') {
      const hasLocal = req.args.includes('--local');
      const hasGlobal = req.args.includes('--global') || req.args.includes('--system');
      if (hasGlobal || !hasLocal) {
        throw new BadRequestException(
          'Global/system git config changes are blocked. Use --local to modify the workspace repo config only.',
        );
      }
    }

    // Block force-push
    if (gitSec.blockForcePush && subcommand === 'push') {
      if (req.args.includes('--force') || req.args.includes('--force-with-lease') || req.args.includes('-f')) {
        throw new BadRequestException('Force-push is blocked by the CodePods administrator.');
      }
    }

    // Protected branches: block force-push, branch deletion, reset --hard, push --delete
    if (gitSec.protectedBranches.length > 0) {
      this.checkProtectedBranches(subcommand, req.args, gitSec.protectedBranches);
    }

    // Block remote add/remove (prevent data exfiltration to arbitrary remotes)
    if (gitSec.blockRemoteManagement && subcommand === 'remote') {
      const remoteAction = req.args.find(
        (a) => a === 'add' || a === 'remove' || a === 'rm' || a === 'set-url' || a === 'rename',
      );
      if (remoteAction) {
        throw new BadRequestException(
          'Remote management (add/remove/rename/set-url) is blocked by the CodePods administrator.',
        );
      }
    }

    // Resolve agent → workspace. Prefer the stable id (survives renames); fall
    // back to the name for shims installed before CODEPODS_AGENT_ID existed.
    const agentInfo = req.agentId
      ? await this.agentsService.resolveById(req.agentId)
      : req.agentName
        ? await this.agentsService.resolveByName(req.agentName)
        : null;
    if (!agentInfo) {
      throw new BadRequestException(
        `Agent "${req.agentId ?? req.agentName}" not found`,
      );
    }
    if (!agentInfo.workspaceId) {
      throw new BadRequestException('Agent has no associated workspace');
    }

    const workspace = await this.workspacesService.findOne(agentInfo.workspaceId, agentInfo.codepodId);
    if (!workspace.path) {
      throw new BadRequestException('Workspace has no resolvable host path');
    }

    // Resolve CWD: map in-container path to host path. Reject any CWD that
    // is not inside the workspace mount — this prevents the agent from
    // accidentally running git in an arbitrary host directory (the previous
    // behaviour silently fell back to the workspace root).
    const mountPath = agentInfo.mountPath;
    if (req.cwd && !req.cwd.startsWith(mountPath)) {
      throw new BadRequestException(
        `Git commands must run inside the workspace mount (${mountPath}), got: ${req.cwd}`,
      );
    }
    let hostCwd = workspace.path;
    if (req.cwd && req.cwd.startsWith(mountPath)) {
      const relPath = req.cwd.substring(mountPath.length).replace(/^\/+/, '');
      if (relPath) {
        hostCwd = path.join(workspace.path, relPath);
      }
    }

    // Enforce a git identity for commit-creating commands, unless the command
    // is aborting/quitting (recovery should never be blocked).
    let extraEnv: Record<string, string> = {};
    const aborting = req.args.includes('--abort') || req.args.includes('--quit');
    if (IDENTITY_COMMANDS.has(subcommand) && !aborting) {
      const identityEnv = this.buildIdentityEnv(hostCwd);
      if (identityEnv === null) {
        throw new BadRequestException(identityErrorMessage());
      }
      extraEnv = identityEnv;
    }

    // Inject credential helper for `git clone` inside the workspace when
    // reuseMainRepoCredentials is enabled and the workspace has a credential.
    let effectiveArgs = req.args;
    if (subcommand === 'clone' && gitSec.reuseMainRepoCredentials && workspace.credentialId) {
      effectiveArgs = this.injectCloneCredential(req.args, workspace.credentialId);
    }

    return this.runGit(effectiveArgs, hostCwd, extraEnv, mountPath, workspace.path, subcommand);
  }

  /**
   * Resolves the git identity for a commit. Priority:
   *  1. The agent's own repo-local user.name/user.email (per-workspace).
   *  2. A generic git identity from the CodePods settings, if enabled.
   * Returns `{}` when the agent already has an identity, the GIT_AUTHOR_* /
   * GIT_COMMITTER_* env vars when using the generic default, or `null` when no
   * identity is available (caller must return an error).
   */
  private buildIdentityEnv(cwd: string): Record<string, string> | null {
    const name = this.getLocalConfig(cwd, 'user.name');
    const email = this.getLocalConfig(cwd, 'user.email');
    if (name && email) return {};

    const cfg = this.configService.getAll();
    if (cfg.useGenericGitIdentity && cfg.gitUserName && cfg.gitUserEmail) {
      return {
        GIT_AUTHOR_NAME: cfg.gitUserName,
        GIT_AUTHOR_EMAIL: cfg.gitUserEmail,
        GIT_COMMITTER_NAME: cfg.gitUserName,
        GIT_COMMITTER_EMAIL: cfg.gitUserEmail,
      };
    }
    return null;
  }

  /** Reads a repo-local git config value, returning '' when unset/absent. */
  private getLocalConfig(cwd: string, key: string): string {
    const res = spawnSync('git', ['config', '--local', '--get', key], {
      cwd,
      encoding: 'utf8',
    });
    if (res.status === 0 && res.stdout) return res.stdout.trim();
    return '';
  }

  /** Spawns real git on the host and captures stdout/stderr/exit code. */
  private runGit(
    args: string[],
    cwd: string,
    extraEnv: Record<string, string>,
    mountPath?: string,
    workspacePath?: string,
    subcommand?: string | null,
  ): Promise<GitExecuteResult> {
    return new Promise<GitExecuteResult>((resolve) => {
      const proc = spawn('git', args, {
        cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...extraEnv },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        let out = stdout;
        // rev-parse --show-toplevel returns the host path, which is invisible
        // inside the container. Map it back to the in-container path so tools
        // (e.g. Copilot CLI) can detect the repo root from within the agent.
        // Preserve the trailing newline that real git emits — trimming it breaks
        // tools that parse the output line-by-line.
        if (mountPath && workspacePath && subcommand === 'rev-parse' && args.includes('--show-toplevel')) {
          const trailingNewline = out.endsWith('\n') ? '\n' : '';
          out = this.toContainerPath(out.trim(), mountPath, workspacePath) + trailingNewline;
        }
        resolve({ stdout: out, stderr, exitCode: code ?? 1 });
      });

      proc.on('error', (err) => {
        resolve({ stdout, stderr: stderr + err.message, exitCode: 1 });
      });
    });
  }

  /**
   * Reverse of the CWD mapping: translate a host path back to the in-container
   * path. Paths outside the workspace are returned unchanged.
   */
  private toContainerPath(hostPath: string, mountPath: string, workspacePath: string): string {
    if (!hostPath) return hostPath;
    if (hostPath === workspacePath) return mountPath;
    if (hostPath.startsWith(workspacePath + path.sep)) {
      return mountPath + hostPath.substring(workspacePath.length);
    }
    return hostPath;
  }

  /** Returns the configured command whitelist as a Set, falling back to the
   *  default list when the config list is empty. */
  private commandWhitelist(gitSec: GitSecurityConfig): Set<string> {
    const list = gitSec.commandWhitelist?.length ? gitSec.commandWhitelist : DEFAULT_GIT_WHITELIST;
    return new Set(list);
  }

  /** Default git security config (used when config is missing the field). */
  private defaultGitSecurity(): GitSecurityConfig {
    return {
      reuseMainRepoCredentials: false,
      commandWhitelist: DEFAULT_GIT_WHITELIST,
      blockGlobalConfig: true,
      blockForcePush: false,
      protectedBranches: ['main', 'dev'],
      blockRemoteManagement: true,
    };
  }

  /** Check for destructive operations on protected branches. Throws if the
   *  command targets a protected branch with a force/delete/reset operation. */
  private checkProtectedBranches(subcommand: string, args: string[], protectedBranches: string[]): void {
    const protectedSet = new Set(protectedBranches);

    if (subcommand === 'push') {
      const isForce = args.includes('--force') || args.includes('--force-with-lease') || args.includes('-f');
      const isDelete = args.includes('--delete') || args.includes('-d');
      if (isForce || isDelete) {
        // The refspec is the last non-option arg, e.g. `push origin --force main`
        // or `push origin --delete dev`. Find the branch name.
        const refspec = this.findPushTargetBranch(args);
        if (refspec && protectedSet.has(refspec)) {
          throw new BadRequestException(
            `Branch "${refspec}" is protected. Force-push and deletion are not allowed.`,
          );
        }
        // If we can't determine the branch, block by default for safety.
        if (!refspec && isDelete) {
          throw new BadRequestException(
            'Cannot determine target branch for delete on protected branch. Operation blocked for safety.',
          );
        }
      }
    }

    if (subcommand === 'branch' && args.includes('-D')) {
      const branchName = args.find((a) => !a.startsWith('-') && a !== '-D' && a !== 'branch');
      // Skip 'branch' subcommand itself — the first non-option arg after -D
      const branchArgs = args.slice(args.indexOf('-D') + 1).filter((a) => !a.startsWith('-'));
      const target = branchArgs[0];
      if (target && protectedSet.has(target)) {
        throw new BadRequestException(`Branch "${target}" is protected and cannot be deleted.`);
      }
    }

    if (subcommand === 'reset' && (args.includes('--hard') || args.includes('-H'))) {
      // reset --hard to a protected branch is destructive. Check if HEAD
      // is being reset to a protected branch — this is hard to detect
      // reliably, so we check if a protected branch name appears as an arg.
      const target = args.find((a) => protectedSet.has(a));
      if (target) {
        throw new BadRequestException(
          `Reset --hard to protected branch "${target}" is not allowed.`,
        );
      }
    }
  }

  /** Extract the target branch name from a `git push` args array. */
  private findPushTargetBranch(args: string[]): string | null {
    // Skip options and 'push' subcommand, find the refspec.
    // e.g. `push origin main` → 'main'
    //      `push origin --force feature/x` → 'feature/x'
    //      `push origin --delete dev` → 'dev'
    //      `push origin refs/heads/main:main` → 'main'
    const nonOptionArgs = args.filter((a) => !a.startsWith('-'));
    // First is 'push', second is remote, third is refspec
    if (nonOptionArgs.length >= 3) {
      const refspec = nonOptionArgs[2];
      // Handle src:dst refspec — take the dst (after colon) or src if no colon
      const parts = refspec.split(':');
      const branch = parts.length > 1 ? parts[1] : parts[0];
      // Strip refs/heads/ prefix
      return branch.replace(/^refs\/heads\//, '');
    }
    return null;
  }

  /** Inject `--config credential.helper=...` into a `git clone` args array
   *  so that sub-repository clones inside the workspace can authenticate
   *  using the main repo's stored credentials. */
  private injectCloneCredential(args: string[], credentialId: number): string[] {
    const helperConfig = `credential.helper=${this.credentialHelperConfig(credentialId)}`;
    // Insert --config after 'clone' but before the URL
    const cloneIdx = args.indexOf('clone');
    if (cloneIdx === -1) return args;
    const result = [...args];
    result.splice(cloneIdx + 1, 0, '--config', helperConfig);
    return result;
  }

  /** Path to the custom git credential helper script (same location as
   *  WorkspacesService uses). */
  private readonly credentialHelperPath = path.join(
    __dirname, '..', '..', 'scripts', 'git-credential-codepods.js',
  );

  /** Build the per-repo credential.helper config value pointing at our helper. */
  private credentialHelperConfig(credentialId: number): string {
    const dataDir = path.resolve(this.configService.getAll().dataDir);
    return `${this.credentialHelperPath} --credential-id=${credentialId} --data-dir=${dataDir}`;
  }

  getShimScript(): string {
    return `#!/bin/sh
# CodePods Git Proxy Shim
# Forwards all git commands to the host API for credential-safe execution.
# The real git on the host runs in the workspace directory with credentials.
#
# ADR-036: the egress proxy injects X-Agent-Id + X-Agent-Sig based on the
# container's source IP, so no secret token is needed in the container.

API_URL="\${CODEPODS_API_URL:-http://host.docker.internal:3000/api}"
# Stable agent id (survives renames). Older agents fall back to the name.
AGENT_ID="\${CODEPODS_AGENT_ID:-}"
AGENT_NAME="\${CODEPODS_AGENT_NAME:-}"

if [ -z "$AGENT_ID" ] && [ -z "$AGENT_NAME" ]; then
  echo "codepods-git: CODEPODS_AGENT_ID not set, cannot proxy git commands" >&2
  exit 1
fi

# Export so the python3/node subprocesses can read them via os.environ / process.env
export AGENT_ID
export AGENT_NAME
CWD="$(pwd)"
export CWD

# Build JSON body using python3 or node (handles all escaping correctly)
if command -v python3 >/dev/null 2>&1; then
  BODY=$(python3 -c "
import json, os, sys
print(json.dumps({'agentId': os.environ.get('AGENT_ID') or None, 'agentName': os.environ.get('AGENT_NAME') or None, 'args': sys.argv[1:], 'cwd': os.environ['CWD']}))
" "$@")
elif command -v node >/dev/null 2>&1; then
  BODY=$(node -e "
const args = process.argv.slice(2);
process.stdout.write(JSON.stringify({agentId: process.env.AGENT_ID || null, agentName: process.env.AGENT_NAME || null, args, cwd: process.env.CWD}));
" "$@")
else
  echo "codepods-git: python3 or node is required" >&2
  exit 1
fi

# Send request — the egress proxy adds X-Agent-Id + X-Agent-Sig.
RESPONSE_FILE=$(mktemp)
HTTP_CODE=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" \\
  -X POST "$API_URL/git/execute" \\
  -H "Content-Type: application/json" \\
  -d "$BODY")

if [ "$HTTP_CODE" != "200" ]; then
  cat "$RESPONSE_FILE" >&2
  rm -f "$RESPONSE_FILE"
  exit 1
fi

# Parse JSON response using python3 or node
if command -v python3 >/dev/null 2>&1; then
  python3 -c "
import json, sys
with open('$RESPONSE_FILE') as f:
    data = json.load(f)
sys.stdout.write(data.get('stdout', ''))
sys.stderr.write(data.get('stderr', ''))
sys.exit(data.get('exitCode', 0))
" < /dev/null
elif command -v node >/dev/null 2>&1; then
  node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$RESPONSE_FILE', 'utf-8'));
process.stdout.write(data.stdout || '');
process.stderr.write(data.stderr || '');
process.exit(data.exitCode || 0);
" < /dev/null
else
  cat "$RESPONSE_FILE"
fi
EXIT_CODE=$?
rm -f "$RESPONSE_FILE"
exit $EXIT_CODE
`;
  }
}