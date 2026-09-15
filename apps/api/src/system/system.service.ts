import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';
import type {
  SystemStats,
  AgentStats,
  ContainerInfo,
  CleanupCheckResult,
  OrphanedWorkspace,
  OrphanedHome,
  UnusedDockerImage,
} from '@codepods/shared-types';
import { DockerService } from '../docker/docker.service';
import { AgentsService } from '../agents/agents.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { HomesService } from '../homes/homes.service';

const execAsync = promisify(exec);

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);
  private prevCpuTimes: { idle: number; total: number } | null = null;

  constructor(
    private readonly docker: DockerService,
    private readonly agents: AgentsService,
    private readonly workspaces: WorkspacesService,
    private readonly homes: HomesService,
  ) {}

  async getSystemStats(): Promise<SystemStats> {
    const [cpuPercent, memInfo, diskInfo, agents, containers] = await Promise.all([
      this.getHostCpuPercent(),
      this.getHostMemInfo(),
      this.getHostDiskInfo(),
      this.agents.findAll(),
      this.docker.listContainers(false),
    ]);

    const agentCount = agents.filter((a) => a.status === 'running').length;

    return {
      cpuPercent,
      memUsed: memInfo.used,
      memTotal: memInfo.total,
      diskUsed: diskInfo.used,
      diskTotal: diskInfo.total,
      agentCount,
      containerCount: containers.length,
    };
  }

  async getAgentStats(includeNonCodepods = false): Promise<AgentStats[]> {
    const agents = await this.agents.findAll();

    // Batch-load container sizes via listContainers({ size: true }) — one API
    // call instead of N inspect() calls, and naturally handles only existing
    // containers (removed containers simply won't be in the map).
    const sizeMap = await this.docker.listContainerSizes();

    // Preload workspaces for size lookups + shared detection
    const wsIds = Array.from(new Set(agents.map((a) => a.workspaceId).filter((x): x is number => x !== null)));
    const wsMap = wsIds.length > 0 ? await this.workspaces.findByIds(wsIds) : new Map();
    const wsRefCount = new Map<number, number>();
    for (const a of agents) {
      if (a.workspaceId) wsRefCount.set(a.workspaceId, (wsRefCount.get(a.workspaceId) ?? 0) + 1);
    }

    const result: AgentStats[] = [];

    for (const agent of agents) {
      // Container disk (writable + virtual) — undefined when container removed
      const cid = agent.containerId ?? agent.id;
      const containerSize = sizeMap.get(cid);
      const diskUsed = containerSize?.sizeRw;
      const diskTotal = containerSize?.sizeRootFs;
      const containerName = containerSize?.name;

      // Workspace size (if linked)
      let workspaceSize = 0;
      let workspaceShared = false;
      if (agent.workspaceId) {
        const ws = wsMap.get(agent.workspaceId);
        if (ws) {
          workspaceSize = this.workspaces.getWorkspaceSize(ws);
        }
        workspaceShared = (wsRefCount.get(agent.workspaceId) ?? 0) > 1;
      }

      // Home size
      const homeSize = this.homes.getHomeSize(agent.id);

      const totalSize = (diskTotal ?? 0) + workspaceSize + homeSize;

      if (agent.status !== 'running') {
        result.push({
          agentId: agent.id,
          agentName: agent.name,
          status: agent.status,
          cpuPercent: 0,
          memUsed: 0,
          memLimit: 0,
          diskUsed,
          diskTotal,
          processCount: 0,
          image: agent.image,
          containerName,
          containerFullId: agent.containerId,
          workspaceSize: workspaceSize || undefined,
          workspaceShared: workspaceShared || undefined,
          homeSize: homeSize || undefined,
          totalSize: totalSize || undefined,
        });
        continue;
      }

      const stats = await this.docker.getContainerStats(cid);

      if (!stats) {
        this.logger.warn(`No stats for running agent ${agent.name} (${cid})`);
      }
      result.push({
        agentId: agent.id,
        agentName: agent.name,
        status: agent.status,
        cpuPercent: stats?.cpuPercent ?? 0,
        memUsed: stats?.memUsed ?? 0,
        memLimit: stats?.memLimit ?? 0,
        diskUsed,
        diskTotal,
        processCount: stats?.processCount ?? 0,
        image: agent.image,
        containerName,
        containerFullId: agent.containerId,
        workspaceSize: workspaceSize || undefined,
        workspaceShared: workspaceShared || undefined,
        homeSize: homeSize || undefined,
        totalSize: totalSize || undefined,
      });
    }

    return result;
  }

  async getNonCodepodsContainers(): Promise<ContainerInfo[]> {
    const containers = await this.docker.listContainers(true);
    const agents = await this.agents.findAll();
    // Match by full container ID (agent.containerId) AND short ID (agent.id)
    // to avoid false positives from truncated comparisons.
    const agentFullIds = new Set(agents.map((a) => a.containerId).filter(Boolean));
    const agentShortIds = new Set(agents.map((a) => a.id).filter(Boolean));

    const result: ContainerInfo[] = [];
    for (const c of containers) {
      // Skip if this container belongs to a codepods agent
      if (agentFullIds.has(c.Id)) continue;
      if (agentShortIds.has(c.Id.slice(0, 12))) continue;

      const [stats, containerSize] = await Promise.all([
        this.docker.getContainerStats(c.Id),
        this.docker.getContainerSize(c.Id),
      ]);
      result.push({
        id: c.Id,
        name: c.Names?.[0]?.replace(/^\//, '') ?? 'unknown',
        image: c.Image ?? '',
        status: c.State ?? 'unknown',
        cpuPercent: stats?.cpuPercent ?? 0,
        memUsed: stats?.memUsed ?? 0,
        memLimit: stats?.memLimit ?? 0,
        diskUsed: containerSize?.sizeRw ?? 0,
        diskTotal: containerSize?.sizeRootFs ?? 0,
        processCount: stats?.processCount ?? 0,
        isCodepods: false,
      });
    }
    return result;
  }

  async getCleanupCheck(): Promise<CleanupCheckResult> {
    const [agents, workspaces, allContainers, allImages] = await Promise.all([
      this.agents.findAll(),
      this.workspaces.findAll(),
      this.docker.listContainers(true),
      this.docker.listImages(),
    ]);

    // Orphaned workspaces: DB records with NO agent linked at all (running or stopped).
    // Workspaces with a stopped agent are NOT orphaned — the agent still exists and
    // may be restarted. A future enhancement could add a 'stopped agent' cleanup
    // category for workspaces whose agent is stopped but not deleted.
    const linkedWorkspaceIds = new Set(
      agents.filter((a) => a.workspaceId).map((a) => a.workspaceId),
    );

    const orphanedWorkspaces: OrphanedWorkspace[] = [];
    for (const ws of workspaces) {
      if (linkedWorkspaceIds.has(ws.id)) continue;

      let gitDirty = false;
      let gitAhead = false;
      try {
        const info = await this.workspaces.getInfo(ws.id);
        gitDirty = info.dirty;
        gitAhead = (info.ahead ?? 0) > 0;
      } catch {
        // workspace may not be accessible
      }

      orphanedWorkspaces.push({
        workspaceId: ws.id,
        name: ws.name,
        slug: ws.slug,
        type: ws.type,
        size: this.workspaces.getWorkspaceSize(ws),
        gitDirty,
        gitAhead,
        stoppedAgentCount: 0,
      });
    }

    // Orphaned homes: directories on disk with no agent in the DB.
    // Homes are stored at <dataDir>/homes/<agentId> — any directory whose
    // name doesn't match a known agentId is an orphan.
    const knownAgentIds = new Set(agents.map((a) => a.id));
    const orphanedHomes: OrphanedHome[] = this.homes
      .listOrphanedHomes(knownAgentIds)
      .map((h) => ({ agentId: h.agentId, path: h.path, size: h.size }));

    // Unused Docker images — images not referenced by any container (running or stopped).
    // This matches `docker images` minus images used by containers.
    const usedImageIds = new Set(
      allContainers.map((c) => c.ImageID).filter(Boolean),
    );
    const unusedDockerImages: UnusedDockerImage[] = allImages
      .filter((img) => !usedImageIds.has(img.id))
      .map((img) => ({
        id: img.id,
        imageRef: img.repoTags?.[0] ?? '<none>',
        size: img.size,
      }));

    return { orphanedWorkspaces, orphanedHomes, unusedDockerImages };
  }

  async removeDockerImage(ref: string): Promise<void> {
    await this.docker.removeImage(ref);
  }

  async removeOrphanedHome(agentId: string): Promise<void> {
    this.homes.removeHome(agentId);
  }

  // ---- Host resource helpers -------------------------------------------

  private async getHostCpuPercent(): Promise<number> {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      const t = cpu.times;
      idle += t.idle;
      total += t.user + t.nice + t.sys + t.irq + t.idle;
    }

    if (this.prevCpuTimes) {
      const idleDelta = idle - this.prevCpuTimes.idle;
      const totalDelta = total - this.prevCpuTimes.total;
      this.prevCpuTimes = { idle, total };
      if (totalDelta > 0) {
        const used = totalDelta - idleDelta;
        return Math.round((used / totalDelta) * 10000) / 100;
      }
    }
    this.prevCpuTimes = { idle, total };
    return 0; // first call — no baseline yet
  }

  private getHostMemInfo(): { used: number; total: number } {
    const total = os.totalmem();
    const used = total - os.freemem();
    return { used, total };
  }

  private async getHostDiskInfo(): Promise<{ used: number; total: number }> {
    try {
      // Use statvfs-like approach via df command
      const { stdout } = await execAsync('df -B1 / | tail -1');
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 4) {
        const total = parseInt(parts[1], 10);
        const used = parseInt(parts[2], 10);
        return { used, total };
      }
    } catch {
      // fall through
    }
    return { used: 0, total: 0 };
  }
}