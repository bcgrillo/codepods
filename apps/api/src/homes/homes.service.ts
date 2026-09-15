import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Manages persisted agent home directories under `<dataDir>/homes/<agentId>`.
 * Each agent gets a 1:1 home directory that is bind-mounted into the container
 * at the manifest's `home_path`. This is the only writable, persistent location
 * when the container runs with `--read-only`.
 */
@Injectable()
export class HomesService {
  constructor(private readonly config: ConfigService) {}

  private get homesDir(): string {
    return path.join(this.config.get('dataDir'), 'homes');
  }

  /** Returns the host path for an agent's home directory. */
  getHomePath(agentId: string): string {
    return path.join(this.homesDir, agentId);
  }

  /** Creates the home directory (and parents) for the given agent id. */
  createHome(agentId: string, agentName?: string): string {
    const homePath = this.getHomePath(agentId);
    fs.mkdirSync(homePath, { recursive: true });
    this.writeDefaultBashrc(homePath, agentName);
    return homePath;
  }

  /**
   * Writes a minimal `.bashrc` into the home so the interactive shell shows a
   * clean prompt. The agent runs as a numeric uid with no `/etc/passwd` entry
   * (the container root FS is read-only), which would otherwise render the
   * default bash prompt as "I have no name!". Only written on first creation
   * — never overwritten, so agent customizations persist across recreates.
   */
  private writeDefaultBashrc(homePath: string, agentName?: string): void {
    const bashrcPath = path.join(homePath, '.bashrc');
    if (fs.existsSync(bashrcPath)) return;
    const safe = (agentName ?? 'agent').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40) || 'agent';
    const content = [
      '# CodePods agent shell — written once at agent creation.',
      '# Sets a clean prompt: the agent runs as a numeric uid with no',
      '# /etc/passwd entry (read-only root FS), which would otherwise show',
      '# "I have no name!" as the bash prompt.',
      'case $- in *i*) ;; *) return;; esac',
      `PS1='\\[\\033[01;36m\\]${safe}\\[\\033[00m\\]@\\h:\\w\\$ '`,
      '',
    ].join('\n');
    fs.writeFileSync(bashrcPath, content, { mode: 0o644 });
  }

  /** Removes the home directory for the given agent id, if it exists. */
  removeHome(agentId: string): void {
    const homePath = this.getHomePath(agentId);
    if (fs.existsSync(homePath)) {
      fs.rmSync(homePath, { recursive: true, force: true });
    }
  }

  /** Returns the size of an agent's home directory in bytes (0 if not found). */
  getHomeSize(agentId: string): number {
    const homePath = this.getHomePath(agentId);
    if (!fs.existsSync(homePath)) return 0;
    return this.dirSize(homePath);
  }

  /**
   * Lists home directories on disk that have no corresponding agent in the DB.
   * Homes are stored at `<dataDir>/homes/<agentId>` — any directory whose name
   * doesn't match a known agentId is an orphan.
   *
   * NOTE: This detects homes whose agent was deleted from the DB but the
   * directory wasn't cleaned up. It does NOT include homes of stopped agents
   * (those agents still exist in the DB). A future enhancement could add a
   * separate 'stopped agent homes' category as a softer cleanup candidate.
   */
  listOrphanedHomes(knownAgentIds: Set<string>): { agentId: string; path: string; size: number }[] {
    if (!fs.existsSync(this.homesDir)) return [];
    const entries = fs.readdirSync(this.homesDir, { withFileTypes: true });
    const orphans: { agentId: string; path: string; size: number }[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (knownAgentIds.has(entry.name)) continue;
      const homePath = path.join(this.homesDir, entry.name);
      const size = this.dirSize(homePath);
      orphans.push({ agentId: entry.name, path: homePath, size });
    }
    return orphans;
  }

  /** Recursively computes the size of a directory in bytes. */
  private dirSize(dirPath: string): number {
    let total = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          total += this.dirSize(full);
        } else if (entry.isFile()) {
          try {
            total += fs.statSync(full).size;
          } catch {
            // symlink or permission issue — skip
          }
        }
      }
    } catch {
      // permission issue — return 0
    }
    return total;
  }
}