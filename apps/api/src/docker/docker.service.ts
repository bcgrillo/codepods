import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Dockerode from 'dockerode';
import type { ContainerInfo, Container } from 'dockerode';
import type { AgentStatus, PortBinding } from '@codepods/shared-types';
import type { Readable } from 'node:stream';
import { ConfigService } from '../config/config.service';
import { demuxDockerLogText } from './demux';

export class DockerImageBuildError extends Error {
  constructor(message: string, readonly output: string[]) {
    super(message);
    this.name = 'DockerImageBuildError';
  }
}

@Injectable()
export class DockerService implements OnModuleInit {
  private readonly logger = new Logger(DockerService.name);
  private docker!: Dockerode;
  private available = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    try {
      this.docker = new Dockerode();
      this.available = true;
    } catch {
      this.logger.warn('Docker is not available. Container features will be disabled.');
      return;
    }
    // Always create the internal agent network — agents always use it
    // (the proxy serves as both API gateway and internet filter).
    void this.ensureNetwork(DockerService.AGENT_NETWORK, true);
  }

  isAvailable(): boolean {
    return this.available;
  }

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  listContainers(all = false): Promise<ContainerInfo[]> {
    return this.docker.listContainers({ all });
  }

  /** List all containers with size info (SizeRw + SizeRootFs) and names.
   *  Returns a map keyed by full container ID. */
  async listContainerSizes(): Promise<Map<string, { sizeRw: number; sizeRootFs: number; name: string }>> {
    try {
      const list = await this.docker.listContainers({ all: true, size: true } as never);
      const map = new Map<string, { sizeRw: number; sizeRootFs: number; name: string }>();
      for (const c of list as unknown as Array<{ Id: string; SizeRw?: number; SizeRootFs?: number; Names?: string[] }>) {
        map.set(c.Id, {
          sizeRw: c.SizeRw ?? 0,
          sizeRootFs: c.SizeRootFs ?? 0,
          name: c.Names?.[0]?.replace(/^\//, '') ?? 'unknown',
        });
      }
      return map;
    } catch {
      return new Map();
    }
  }

  getContainer(id: string): Container {
    return this.docker.getContainer(id);
  }

  async startContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).start();
  }

  async stopContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).stop();
  }

  async restartContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).restart();
  }

  async removeContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).remove({ force: true });
  }

  /** Check whether a container with the given ID still exists. */
  async containerExists(id: string): Promise<boolean> {
    try {
      await this.docker.getContainer(id).inspect();
      return true;
    } catch {
      return false;
    }
  }

  /** Fetch stdout/stderr logs of a container (last N lines). Returns a string. */
  async getContainerLogs(id: string, tail = 100): Promise<string> {
    const container = this.docker.getContainer(id);
    const buf = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      follow: false,
    });
    // Docker multiplexes stdout/stderr with an 8-byte header per chunk when
    // the stream is not a TTY. `container.logs({follow:false})` returns the
    // raw framed body, so strip the headers to get readable text (the demux
    // falls back to passthrough when the stream is already clean).
    return demuxDockerLogText(buf).trim();
  }

  async renameContainer(id: string, newName: string): Promise<void> {
    await this.docker.getContainer(id).rename({ name: newName });
  }

  async createContainer(opts: Dockerode.ContainerCreateOptions): Promise<Container> {
    return this.docker.createContainer(opts);
  }

  async imageExists(imageRef: string): Promise<boolean> {
    try {
      await this.docker.getImage(imageRef).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async buildImageFromContext(params: {
    contextPath: string;
    sourceFiles: string[];
    dockerfile: string;
    imageRef: string;
    labels: Record<string, string>;
    buildArgs: Record<string, string>;
    onProgress?: (line: string) => void;
  }): Promise<string[]> {
    const buildOutput: string[] = [];
    const pushOutput = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      buildOutput.push(trimmed);
      if (buildOutput.length > 500) {
        buildOutput.shift();
      }
      params.onProgress?.(trimmed);
    };

    const stream = await this.docker.buildImage(
      { context: params.contextPath, src: params.sourceFiles },
      {
        t: params.imageRef,
        dockerfile: params.dockerfile,
        labels: params.labels,
        buildargs: params.buildArgs,
        buildkit: '1',
      } as Dockerode.ImageBuildOptions,
    );

    await new Promise<void>((resolve, reject) => {
      (this.docker as Dockerode & {
        modem: {
          followProgress: (
            s: Readable,
            done: (err: Error | null) => void,
            onProgress?: (event: Record<string, unknown>) => void,
          ) => void;
        };
      }).modem.followProgress(
        stream as Readable,
        (err: Error | null) => {
          if (err) {
            reject(new DockerImageBuildError(err.message, buildOutput));
            return;
          }
          resolve();
        },
        (event) => {
          if (typeof event.stream === 'string') {
            for (const part of event.stream.split('\n')) pushOutput(part);
            return;
          }
          if (typeof event.error === 'string') {
            pushOutput(`ERROR: ${event.error}`);
            return;
          }
          if (typeof event.status === 'string') {
            const progress = typeof event.progress === 'string' ? ` ${event.progress}` : '';
            pushOutput(`${event.status}${progress}`);
          }
        },
      );
    });

    return buildOutput;
  }

  mapStatus(state: string): AgentStatus {
    const map: Record<string, AgentStatus> = {
      running: 'running',
      stopped: 'stopped',
      exited: 'exited',
      paused: 'paused',
    };
    return map[state.toLowerCase()] ?? 'unknown';
  }

  mapPorts(ports: ContainerInfo['Ports']): PortBinding[] {
    return ports
      .filter((p) => p.PublicPort)
      .map((p) => ({
        containerPort: p.PrivatePort,
        hostPort: p.PublicPort!,
        protocol: (p.Type as 'tcp' | 'udp') ?? 'tcp',
      }));
  }

  async getContainerInternalIp(id: string): Promise<string | null> {
    try {
      const info = await this.docker.getContainer(id).inspect();
      const networks = info.NetworkSettings.Networks;
      if (!networks) return null;

      const preferredNetwork =
        networks['codepods'] ?? networks['bridge'] ?? Object.values(networks)[0];
      return preferredNetwork?.IPAddress ?? null;
    } catch {
      return null;
    }
  }

  /** Get container stats (non-streaming): CPU %, memory, process count. */
  async getContainerStats(id: string): Promise<{
    cpuPercent: number;
    memUsed: number;
    memLimit: number;
    processCount: number;
  } | null> {
    try {
      const container = this.docker.getContainer(id);

      // Take two samples ~1s apart for accurate CPU% calculation.
      // A single non-stream call often has precpu_stats == cpu_stats (or
      // precpu_stats empty), giving a delta of 0 → CPU% always 0.
      const sample1 = await container.stats({ stream: false });
      await new Promise((r) => setTimeout(r, 1000));
      const sample2 = await container.stats({ stream: false });

      // Memory — use the latest sample
      const memStats = sample2.memory_stats;
      const memUsed = memStats?.usage ?? 0;
      const memLimit = memStats?.limit ?? 0;

      // CPU — compute percentage from the delta between the two samples
      const cpuDelta =
        (sample2.cpu_stats.cpu_usage.total_usage ?? 0) -
        (sample1.cpu_stats.cpu_usage.total_usage ?? 0);
      const systemDelta =
        (sample2.cpu_stats.system_cpu_usage ?? 0) -
        (sample1.cpu_stats.system_cpu_usage ?? 0);
      const onlineCpus = sample2.cpu_stats.online_cpus ?? 1;
      let cpuPercent = 0;
      if (systemDelta > 0 && cpuDelta >= 0) {
        cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100;
      }

      // Process count — pids_stats.current (available in newer Docker versions)
      const processCount = sample2.pids_stats?.current ?? 0;

      return { cpuPercent: Math.round(cpuPercent * 100) / 100, memUsed, memLimit, processCount };
    } catch {
      return null;
    }
  }

  /** Get container size (writable layer + virtual) via inspect with size. */
  async getContainerSize(id: string): Promise<{ sizeRw: number; sizeRootFs: number } | null> {
    try {
      const info = await this.docker.getContainer(id).inspect({ size: true } as never);
      const raw = info as unknown as { SizeRw?: number; SizeRootFs?: number };
      return {
        sizeRw: raw.SizeRw ?? 0,
        sizeRootFs: raw.SizeRootFs ?? 0,
      };
    } catch {
      return null;
    }
  }

  /** Get Docker image size in bytes. */
  async getImageSize(imageRef: string): Promise<number | null> {
    try {
      const info = await this.docker.getImage(imageRef).inspect();
      return info.Size ?? null;
    } catch {
      return null;
    }
  }

  /** List all Docker images with their ID, tags, and size. */
  async listImages(): Promise<Array<{ id: string; repoTags: string[] | null; size: number }>> {
    try {
      const images = await this.docker.listImages();
      return images.map((img) => ({
        id: img.Id,
        repoTags: img.RepoTags ?? null,
        size: img.Size,
      }));
    } catch {
      return [];
    }
  }

  /** Remove a Docker image (docker rmi -f). */
  async removeImage(ref: string): Promise<void> {
    await this.docker.getImage(ref).remove({ force: true });
  }

  /** Get Docker system info (total containers, images, disk usage). */
  async getSystemInfo(): Promise<{
    containers: number;
    containersRunning: number;
    images: number;
  } | null> {
    try {
      const info = await this.docker.info();
      return {
        containers: info.Containers ?? 0,
        containersRunning: info.ContainersRunning ?? 0,
        images: info.Images ?? 0,
      };
    } catch {
      return null;
    }
  }

  /** Get Docker disk usage (builder cache + images + containers). */
  async getDiskUsage(): Promise<{ used: number; total: number } | null> {
    try {
      const info = await this.docker.info();
      // Docker reports data space used/total (when available via devicemapper)
      // For overlay2, we fall back to the system df API
      const df = await this.docker.df();
      let used = 0;
      for (const layer of df.Layers ?? []) {
        used += layer.Size ?? 0;
      }
      // Total is hard to get reliably — use the host filesystem
      return { used, total: 0 };
    } catch {
      return null;
    }
  }

  /** Name of the dedicated internal network used for egress-filtered agents. */
  static readonly AGENT_NETWORK = 'codepods-agents';

  /** Map: container IP on the agent network → { agentId, containerId }.
   *  Used by the egress proxy to identify which agent sent each API request. */
  private readonly agentIpMap = new Map<string, { agentId: string; containerId: string }>();

  /**
   * Registers a container's IP → agentId mapping so the egress proxy can
   * identify which agent sent each API request. Called after container start.
   */
  async registerAgentIp(containerId: string, agentId: string): Promise<void> {
    if (!this.available) return;
    try {
      const info = await this.docker.getContainer(containerId).inspect();
      const networks = info.NetworkSettings?.Networks;
      if (!networks) return;
      const agentNet = networks[DockerService.AGENT_NETWORK];
      if (agentNet?.IPAddress) {
        this.agentIpMap.set(agentNet.IPAddress, { agentId, containerId });
        this.logger.debug(`Registered agent ${agentId} at IP ${agentNet.IPAddress}`);
      }
    } catch (err) {
      this.logger.warn(`Could not register agent IP: ${(err as Error).message}`);
    }
  }

  /** Removes an agent's IP mapping when its container is stopped/removed. */
  unregisterAgent(containerId: string): void {
    for (const [ip, entry] of this.agentIpMap) {
      if (entry.containerId === containerId) {
        this.agentIpMap.delete(ip);
        return;
      }
    }
  }

  /** Looks up the agent ID for a given container IP (used by egress proxy). */
  getAgentIdByIp(ip: string): string | null {
    return this.agentIpMap.get(ip)?.agentId ?? null;
  }

  /**
   * Ensures the internal agent network exists. When `internal` is true the
   * network has no external (internet) route — agents can only reach the host
   * gateway (where the egress proxy lives) and each other.
   */
  async ensureNetwork(name: string, internal = true): Promise<void> {
    if (!this.available) return;
    try {
      await this.docker.getNetwork(name).inspect();
      return; // already exists
    } catch {
      // not found — create below
    }
    try {
      await this.docker.createNetwork({
        Name: name,
        Internal: internal,
        Driver: 'bridge',
      });
      this.logger.log(`Created Docker network "${name}" (internal=${internal}).`);
    } catch (err) {
      this.logger.warn(`Could not create network "${name}": ${(err as Error).message}`);
    }
  }

  /**
   * Returns the gateway IP of a Docker network, ensuring it exists first.
   *
   * On `--internal` networks the `host-gateway` extra-host token does not always
   * resolve to a reachable IP, so callers bind `host.docker.internal` to this
   * explicit gateway IP instead (the gateway is the host's interface on the
   * bridge and is reachable even on internal networks). Returns null when the
   * gateway cannot be determined.
   */
  async getNetworkGateway(name: string, internal = true): Promise<string | null> {
    if (!this.available) return null;
    await this.ensureNetwork(name, internal);
    try {
      const info = await this.docker.getNetwork(name).inspect();
      const cfg = (info as unknown as { IPAM?: { Config?: Array<{ Gateway?: string }> } }).IPAM?.Config;
      const gw = cfg?.find((c) => c.Gateway)?.Gateway;
      return gw ?? null;
    } catch {
      return null;
    }
  }
}
