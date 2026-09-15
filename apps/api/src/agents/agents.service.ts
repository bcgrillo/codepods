import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Writable } from 'stream';
import { IsNull, Repository } from 'typeorm';
import type {
  Agent,
  AgentService,
  AgentStatus,
  AgentNotice,
  AgentNoticeSeverity,
  CreateAgentServiceDto,
  PortBinding,
  UpdateAgentServiceDto,
  UpdateAgentEnvVarsDto,
  AgentCommandMeta,
  ExecuteAgentCommandDto,
  ExecuteAgentCommandResult,
  DockerRunConfig,
  Skill,
} from '@codepods/shared-types';
import { AgentEntity } from './agent.entity';
import { AgentServiceEntity } from './agent-service.entity';
import { AgentNoticeEntity } from './agent-notice.entity';
import { ImageTemplateEntity } from '../images/image-template.entity';
import { DockerService } from '../docker/docker.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ImagesService } from '../images/images.service';
import { AiProvidersService } from '../ai-proxy/ai-providers.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ConfigService } from '../config/config.service';
import { HomesService } from '../homes/homes.service';
import { McpServersService } from '../mcp-servers/mcp-servers.service';
import { SkillsService } from '../skills/skills.service';

@Injectable()
export class AgentsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    @InjectRepository(AgentEntity)
    private readonly agentRepo: Repository<AgentEntity>,
    @InjectRepository(AgentServiceEntity)
    private readonly agentServiceRepo: Repository<AgentServiceEntity>,
    @InjectRepository(AgentNoticeEntity)
    private readonly agentNoticeRepo: Repository<AgentNoticeEntity>,
    @InjectRepository(ImageTemplateEntity)
    private readonly imageTemplateRepo: Repository<ImageTemplateEntity>,
    private readonly docker: DockerService,
    private readonly imagesService: ImagesService,
    private readonly aiProviders: AiProvidersService,
    private readonly workspacesService: WorkspacesService,
    private readonly configService: ConfigService,
    private readonly homesService: HomesService,
    private readonly mcpServersService: McpServersService,
    private readonly skillsService: SkillsService,
  ) {}

  /**
   * On startup, re-register IPs of all running agent containers so the egress
   * proxy can identify them. The agentIpMap is in-memory and is lost on restart;
   * without this, existing agents would get 403 from the proxy after a deploy.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.docker.isAvailable()) return;
    try {
      const records = await this.agentRepo.find();
      let registered = 0;
      for (const rec of records) {
        if (!rec.containerId) continue;
        const info = await this.docker
          .getContainer(rec.containerId)
          .inspect()
          .catch(() => null);
        if (info?.State?.Running) {
          await this.docker.registerAgentIp(rec.containerId, rec.id);
          registered++;
        }
      }
      if (registered > 0) {
        this.logger.log(`Re-registered ${registered} running agent(s) with egress proxy`);
      }
    } catch (err) {
      this.logger.warn(`Failed to re-register agent IPs on startup: ${(err as Error).message}`);
    }
  }

  async findAll(codepodId = 1): Promise<Agent[]> {
    const [containers, records, templates, services] = await Promise.all([
      this.docker.listContainers(true),
      this.agentRepo.find({ where: { codepodId } }),
      this.imageTemplateRepo.find({ where: { codepodId } }),
      this.agentServiceRepo.find({ where: { codepodId }, order: { id: 'ASC' } }),
    ]);

    const containerMap = new Map(containers.map((c) => [c.Id, c]));
    const templateMap = new Map(templates.map((t) => [t.id, t]));
    const servicesByAgent = new Map<string, AgentService[]>();
    for (const s of services) {
      const list = servicesByAgent.get(s.agentId) ?? [];
      list.push(this.mapAgentService(s));
      servicesByAgent.set(s.agentId, list);
    }

    // Batch-load workspaces for all agents that have one.
    const wsIds = Array.from(new Set(records.map((r) => r.workspaceId).filter((x): x is number => x !== null)));
    const wsMap = await this.workspacesService.findByIds(wsIds, codepodId);

    return records.map((rec) => {
      const container = containerMap.get(rec.containerId);
      const template = rec.imageTemplateId ? templateMap.get(rec.imageTemplateId) : undefined;
      const workspace = rec.workspaceId
        ? (() => {
            const ws = wsMap.get(rec.workspaceId);
            return ws ? { name: ws.name, slug: ws.slug, mountPath: this.mountPathFromTemplate(template) } : null;
          })()
        : null;
      return this.buildAgentResponse(
        rec,
        container ? this.docker.mapStatus(container.State) : 'unknown',
        container ? this.docker.mapPorts(container.Ports) : [],
        template,
        workspace,
        servicesByAgent.get(rec.id) ?? [],
      );
    });
  }

  async findOne(id: string): Promise<Agent> {
    const rec = await this.agentRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Agent ${id} not found`);

    const template = rec.imageTemplateId ? await this.imageTemplateRepo.findOne({ where: { id: rec.imageTemplateId } }) : null;

    // Inspect the container; if it no longer exists (exited + auto-removed, or
    // never started), fall back to 'unknown' status instead of throwing 404.
    let info: any = null;
    try {
      info = await this.docker.getContainer(rec.containerId).inspect();
    } catch {
      info = null;
    }

    const ports: PortBinding[] = [];
    if (info?.NetworkSettings?.Ports) {
      for (const [key, bindings] of Object.entries(info.NetworkSettings.Ports as Record<string, Array<{ HostPort: string }> | null>)) {
        if (!bindings) continue;
        const [portStr, protocol] = key.split('/');
        for (const b of bindings) {
          ports.push({
            containerPort: parseInt(portStr, 10),
            hostPort: parseInt(b.HostPort, 10),
            protocol: (protocol as 'tcp' | 'udp') ?? 'tcp',
          });
        }
      }
    }

    // Load associated workspace (if any) for display.
    let workspace: { name: string; slug: string; mountPath: string } | null = null;
    if (rec.workspaceId) {
      try {
        const ws = await this.workspacesService.findOne(rec.workspaceId, rec.codepodId);
        workspace = { name: ws.name, slug: ws.slug, mountPath: this.mountPathFromTemplate(template) };
      } catch {
        workspace = null;
      }
    }

    // Load services for this agent.
    const services = await this.agentServiceRepo.find({ where: { agentId: rec.id }, order: { id: 'ASC' } });

    return this.buildAgentResponse(
      rec,
      info ? this.docker.mapStatus(info.State.Status) : 'unknown',
      ports,
      template,
      workspace,
      services.map((s) => this.mapAgentService(s)),
    );
  }

  async create(dto: CreateAgentDto): Promise<Agent> {
    const imageSelection = await this.resolveImageForAgent(dto);
    const image = imageSelection.imageRef;

    // Home directory: always created and bind-mounted (mandatory in manifest).
    const homeMountPath = imageSelection.homeMountPath;
    if (!homeMountPath) {
      throw new BadRequestException(
        'Template manifest is missing mandatory "home_path".',
      );
    }

    // Stable agent id, generated before the container exists so it can be baked
    // into the container env. Unlike the name, it never changes on rename, so the
    // git proxy can identify the agent by id regardless of renames.
    const agentId = randomBytes(6).toString('hex');

    // Create the persisted home directory for this agent.
    const homePath = this.homesService.createHome(agentId, dto.name);

    // Resolve workspace bind-mount (if a workspace is associated).
    const binds: string[] = [`${homePath}:${homeMountPath}`];
    const ws =
      dto.workspaceId !== undefined && dto.workspaceId !== null
        ? await this.workspacesService.findOne(dto.workspaceId, dto.codepodId ?? 1)
        : null;
    if (ws && !ws.path) {
      throw new BadRequestException(`Workspace ${dto.workspaceId} has no resolvable host path.`);
    }
    if (ws) {
      binds.push(`${ws.path}:${imageSelection.workspaceMountPath}`);
    }

    const dockerConfig = this.configService.get('docker');
    // Assign a per-agent logical uid (random, collision-checked) when the toggle is
    // on; otherwise run as the API process's own uid (experimental, native writes).
    // The manifest `user` is ignored entirely — we always control the --user value.
    const agentUid = dockerConfig.forceNonRootUser ? await this.assignAgentUid() : null;
    const agentGid = agentUid;
    const userSpec = this.runUserSpec(agentUid);
    const dockerOpts = buildDockerCreateOptions(dockerConfig, userSpec, this.configService.get('docker').dropNetRaw);
    const egress = await this.egressConfig();

    const envLines = [
      ...(dto.env ? Object.entries(dto.env).map(([k, v]) => `${k}=${v}`) : []),
      `CODEPODS_AGENT_NAME=${dto.name}`,
      `CODEPODS_AGENT_ID=${agentId}`,
      `CODEPODS_API_URL=http://host.docker.internal:3000/api`,
      ...egress.env,
    ];
    const portBindings = dto.ports?.reduce(
      (acc, p) => ({
        ...acc,
        [`${p.containerPort}/${p.protocol ?? 'tcp'}`]: [{ HostPort: String(p.hostPort) }],
      }),
      {},
    );
    const exposedPorts = dto.ports?.reduce(
      (acc, p) => ({ ...acc, [`${p.containerPort}/${p.protocol ?? 'tcp'}`]: {} }),
      {},
    );

    // Log the actual docker run command (with mounts, env, user) for diagnostics.
    // Written after the agent record exists so appendActivityLog can find it.
    const dockerRunLog = `Docker run: ${summarizeDockerRun({ image, binds, userSpec, envCount: envLines.length, networkMode: egress.networkMode ?? null, dockerConfig })}`;

    const container = await this.docker.createContainer({
      name: dto.name,
      Image: image,
      Env: envLines,
      ExposedPorts: exposedPorts,
      ...dockerOpts.topLevel,
      HostConfig: {
        PortBindings: portBindings,
        ExtraHosts: egress.extraHosts,
        Binds: binds,
        ...(egress.networkMode ? { NetworkMode: egress.networkMode } : {}),
        ...dockerOpts.hostConfig,
      },
    });

    // Grant the agent uid POSIX ACL access to its persisted home and (optionally)
    // the shared workspace bind-mount BEFORE starting the container, so the
    // agent can write to its home as soon as the entrypoint runs. Both dirs stay
    // owned by the API process; the agent (a different uid) only gets an ACL
    // entry — no root needed (no chown). Skipped entirely when the toggle is off.
    const aclWarnings: string[] = [];
    if (agentUid !== null) {
      const homeError = await this.workspacesService.grantAgentAccess(homePath, agentUid);
      if (homeError) {
        aclWarnings.push(
          `WARNING: could not grant home ACL to the agent user: ${homeError}`,
        );
      }
      if (ws?.path) {
        const wsError = await this.workspacesService.grantAgentAccess(ws.path, agentUid);
        if (wsError) {
          aclWarnings.push(
            `WARNING: could not grant workspace ACL to the agent user: ${wsError}`,
          );
        }
      }
    }

    await container.start();
    const info = await container.inspect();

    // A container can exit immediately after start() (entrypoint failure,
    // read-only fs write, uid permission issue, …). Detect that here and
    // capture the exit code + logs so the user can diagnose the problem,
    // instead of letting subsequent exec commands fail with a confusing 409.
    let exitDiag: string | null = null;
    if (!info.State?.Running) {
      const exitCode = info.State?.ExitCode ?? '?';
      const errMsg = info.State?.Error ?? '';
      let logTail = '';
      try {
        logTail = await this.docker.getContainerLogs(info.Id, 50);
      } catch {
        // ignore log fetch errors
      }
      const parts = [
        `Container exited immediately after start (exit code: ${exitCode})`,
        errMsg ? `State error: ${errMsg}` : '',
        logTail ? `Container logs (last 50 lines):\n${logTail}` : '(no logs available)',
      ].filter(Boolean);
      exitDiag = parts.join('\n');
      this.logger.error(`Agent ${agentId} container exited immediately (exit=${exitCode}): ${logTail.slice(0, 500)}`);
    }

    await this.saveAgentUnique({
      id: agentId,
      containerId: info.Id,
      name: dto.name,
      image,
      codepodId: dto.codepodId ?? 1,
      imageTemplateId: dto.imageTemplateId ?? null,
      workspaceId: dto.workspaceId ?? null,
      envVars: dto.env ? JSON.stringify(dto.env) : null,
      dockerRunConfig: JSON.stringify(dockerConfig),
      homePath,
      agentUid,
      agentGid,
      portBindings: dto.ports ? JSON.stringify(dto.ports) : null,
    });

    // Register the container's IP for agent identification by the egress proxy.
    await this.docker.registerAgentIp(info.Id, agentId);

    if (imageSelection.services.length > 0) {
      await this.agentServiceRepo.save(
        imageSelection.services.map((service) => ({
          agentId,
          codepodId: dto.codepodId ?? 1,
          type: service.type,
          name: service.name,
          port: service.port,
        })),
      );
    }

    await this.appendActivityLog(agentId, `Agent created (image: ${image})`);
    await this.appendActivityLog(agentId, dockerRunLog);
    for (const w of aclWarnings) {
      await this.appendActivityLog(agentId, w);
    }
    // Generate user-visible notices for ACL permission errors so the user
    // can take action (e.g. run setfacl manually with sudo).
    if (aclWarnings.length > 0) {
      await this.createNotice(agentId, {
        severity: 'warning',
        title: 'Permission issue: could not set workspace ACLs',
        message:
          'Some files in the workspace could not be granted to the agent user. ' +
          'The agent may not be able to write to all workspace files. ' +
          'This typically happens when the API process is not root and the workspace ' +
          'contains files owned by another user.',
        actionLabel: 'Copy suggested command',
        actionText: `sudo setfacl -R -m u:${agentUid}:rwX "${ws?.path ?? homePath}" && sudo find "${ws?.path ?? homePath}" -type d -exec setfacl -m d:u:${agentUid}:rwX {} +`,
      });
    }
    if (exitDiag) {
      await this.appendActivityLog(agentId, exitDiag);
      await this.createNotice(agentId, {
        severity: 'error',
        title: 'Container exited immediately after start',
        message: exitDiag,
      });
    }
    if (egress.networkMode) {
      const wl = this.configService.get('networkSecurity').egressWhitelist.length;
      await this.appendActivityLog(
        agentId,
        `Egress filtering ON (network: ${egress.networkMode}, whitelist: ${wl} entries)`,
      );
    }

    // Auto-connect MCP servers flagged connectAllAgents (only if the template
    // defines an add_mcp_server command). The built-in CodePods MCP is included
    // when its connectAllAgents flag is true (default).
    await this.autoConnectMcps(agentId, dto.imageTemplateId ?? null);

    return this.findOne(agentId);
  }

  async start(id: string): Promise<void> {
    const rec = await this.agentRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Agent ${id} not found`);

    // Ephemeral containers (--rm): Docker auto-removes the container on stop.
    // If the container no longer exists, recreate it using the CURRENT docker
    // config (not the snapshot) and update the stored snapshot so the agent
    // always reflects the latest configuration used.
    const containerExists = await this.docker.containerExists(rec.containerId).catch(() => false);
    if (!containerExists) {
      await this.recreateContainer(rec);
      await this.appendActivityLog(id, 'Container recreated (--rm) with current docker config');
    } else {
      await this.docker.startContainer(rec.containerId);
      // Re-register the container's IP — it was unregistered on stop() and the
      // egress proxy needs the IP→agentId mapping to authenticate requests.
      await this.docker.registerAgentIp(rec.containerId, rec.id);
      await this.appendActivityLog(id, 'Container started');
    }

    // If the template defines a start_agent command, run it after starting
    const template = rec.imageTemplateId
      ? await this.imageTemplateRepo.findOne({ where: { id: rec.imageTemplateId } })
      : null;
    const hasStartAgent = template?.manifest?.commands?.some((c) => c.type === 'start_agent') ?? false;
    if (hasStartAgent) {
      try {
        await this.executeCommand(id, { type: 'start_agent' });
      } catch (e) {
        await this.appendActivityLog(id, `start_agent failed: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }
  }

  async stop(id: string): Promise<void> {
    const rec = await this.agentRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Agent ${id} not found`);

    // If the template defines a stop_agent command, run it before stopping
    const template = rec.imageTemplateId
      ? await this.imageTemplateRepo.findOne({ where: { id: rec.imageTemplateId } })
      : null;
    const hasStopAgent = template?.manifest?.commands?.some((c) => c.type === 'stop_agent') ?? false;
    if (hasStopAgent) {
      try {
        await this.executeCommand(id, { type: 'stop_agent' });
      } catch (e) {
        await this.appendActivityLog(id, `stop_agent failed: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    // Parse the docker run config snapshot to determine ephemeral behavior.
    const dockerCfg = rec.dockerRunConfig ? safeParseDockerConfig(rec.dockerRunConfig) : null;
    const isEphemeral = dockerCfg?.autoRemove === true;

    await this.docker.stopContainer(rec.containerId);
    this.docker.unregisterAgent(rec.containerId);
    await this.appendActivityLog(id, isEphemeral ? 'Container stopped and removed (--rm)' : 'Container stopped');
  }

  async updateEnvVars(id: string, dto: UpdateAgentEnvVarsDto): Promise<Agent> {
    const rec = await this.requireAgent(id);
    rec.envVars = Object.keys(dto.envVars).length > 0 ? JSON.stringify(dto.envVars) : null;
    await this.agentRepo.save(rec);
    const count = Object.keys(dto.envVars).length;
    await this.appendActivityLog(id, `Environment variables updated (${count} var${count === 1 ? '' : 's'})`);
    return this.findOne(id);
  }

  async rename(id: string, newName: string): Promise<Agent> {
    const rec = await this.requireAgent(id);
    const trimmed = newName.trim();
    if (!trimmed) throw new BadRequestException('Agent name cannot be empty.');
    if (trimmed === rec.name) return this.findOne(id);

    // Check uniqueness within the codepod
    const existing = await this.findByName(trimmed, rec.codepodId);
    if (existing && existing.id !== rec.id) {
      throw new ConflictException(`Agent name "${trimmed}" already exists in this codepod.`);
    }

    const oldName = rec.name;
    rec.name = trimmed;
    await this.agentRepo.save(rec);

    // Rename the Docker container if it still exists
    try {
      await this.docker.renameContainer(rec.containerId, trimmed);
    } catch (e) {
      await this.appendActivityLog(id, `Docker rename failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }

    await this.appendActivityLog(id, `Agent renamed: "${oldName}" → "${trimmed}"`);
    return this.findOne(id);
  }

  async restart(id: string): Promise<Agent> {
    const rec = await this.requireAgent(id);
    const template = rec.imageTemplateId
      ? await this.imageTemplateRepo.findOne({ where: { id: rec.imageTemplateId } })
      : null;
    const hasStopAgent = template?.manifest?.commands?.some((c) => c.type === 'stop_agent') ?? false;
    const hasStartAgent = template?.manifest?.commands?.some((c) => c.type === 'start_agent') ?? false;

    // restart only runs the template commands (stop_agent then start_agent);
    // it never restarts the Docker container itself. If the template defines
    // neither command or the container is not running, there is nothing to do.
    if (!hasStopAgent && !hasStartAgent) {
      await this.appendActivityLog(id, 'Restart skipped: template defines no stop_agent/start_agent command');
      return this.findOne(id);
    }

    const info = await this.docker.getContainer(rec.containerId).inspect().catch(() => null);
    if (!info || !info.State.Running) {
      await this.appendActivityLog(id, 'Restart skipped: container is not running');
      return this.findOne(id);
    }

    if (hasStopAgent) {
      try {
        await this.executeCommand(id, { type: 'stop_agent' });
      } catch (e) {
        await this.appendActivityLog(id, `stop_agent failed: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    if (hasStartAgent) {
      try {
        await this.executeCommand(id, { type: 'start_agent' });
      } catch (e) {
        await this.appendActivityLog(id, `start_agent failed: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    return this.findOne(id);
  }

  /**
   * Recreate the container from scratch using the CURRENT docker/egress config.
   * Preserves the agent record (id, name, uid), home path, workspace binds,
   * env vars, and port bindings. Useful after config changes (e.g. ADR-036
   * egress proxy) so existing agents pick up the new network setup without
   * losing data.
   */
  async recreate(id: string): Promise<Agent> {
    const rec = await this.requireAgent(id);

    // Stop + remove the old container (if it still exists).
    const containerExists = await this.docker.containerExists(rec.containerId).catch(() => false);
    if (containerExists) {
      const info = await this.docker.getContainer(rec.containerId).inspect().catch(() => null);
      if (info?.State?.Running) {
        await this.docker.stopContainer(rec.containerId);
      }
      this.docker.unregisterAgent(rec.containerId);
      await this.docker.removeContainer(rec.containerId).catch(() => {
        // autoRemove containers may already be gone after stop.
      });
    }

    // Recreate with current config — preserves home, workspace, uid, agent id.
    await this.recreateContainer(rec);
    await this.appendActivityLog(id, 'Container recreated with current docker/egress config');

    // Run start_agent command if the template defines one.
    const template = rec.imageTemplateId
      ? await this.imageTemplateRepo.findOne({ where: { id: rec.imageTemplateId } })
      : null;
    const hasStartAgent = template?.manifest?.commands?.some((c) => c.type === 'start_agent') ?? false;
    if (hasStartAgent) {
      try {
        await this.executeCommand(id, { type: 'start_agent' });
      } catch (e) {
        await this.appendActivityLog(id, `start_agent failed: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    return this.findOne(id);
  }

  async executeCommand(id: string, dto: ExecuteAgentCommandDto): Promise<ExecuteAgentCommandResult> {
    const rec = await this.requireAgent(id);

    // Find the command template from the template manifest
    const template = rec.imageTemplateId
      ? await this.imageTemplateRepo.findOne({ where: { id: rec.imageTemplateId } })
      : null;
    const commands = template?.manifest?.commands ?? [];
    const cmd = commands.find((c) => c.type === dto.type);
    if (!cmd) {
      throw new BadRequestException(`This agent's template does not define a ${dto.type} command.`);
    }

    let fullCommand = cmd.command;

    if (dto.type === 'set_provider') {
      // Resolve the provider (by slug or "default")
      const providerSlug = dto.providerSlug ?? 'default';
      const provider = await this.aiProviders.findBySlug(providerSlug);
      if (!provider) throw new NotFoundException(`AI provider "${providerSlug}" not found`);

      // When the model is "default" (or not specified), pass it literally —
      // the AI proxy resolves "default" to the provider's actual default model
      // at request time. Changing the default model in the admin UI takes
      // effect immediately without re-running set_provider.
      const modelName = dto.modelName ?? 'default';

      // Build values for command substitution
      const baseUrl = `http://host.docker.internal:3000/api/ai-proxy/${providerSlug}`;
      const apiKey = '123456'; // fake — proxy injects real key
      const providerName = provider.name;
      const providerType = provider.type;
      // When the user picks the "default" sentinel, keep the metadata honest:
      // the box should read "default", not the name of whatever provider is
      // currently the default. Command substitution still uses the resolved
      // provider's real name/type.
      const isDefaultSlug = providerSlug === 'default';

      // Substitute variables in the command template
      fullCommand = fullCommand
        .replace(/\$baseUrl/g, shellEscape(baseUrl))
        .replace(/\$modelName/g, shellEscape(modelName))
        .replace(/\$apiKey/g, shellEscape(apiKey))
        .replace(/\$providerName/g, shellEscape(providerName))
        .replace(/\$providerType/g, shellEscape(providerType));

      // Prepare metadata to store
      const meta: AgentCommandMeta = rec.commandMeta ? JSON.parse(rec.commandMeta) : {};
      meta.set_provider = {
        providerSlug,
        providerName: isDefaultSlug ? 'default' : providerName,
        providerType,
        baseUrl,
        modelName,
        executedAt: new Date().toISOString(),
      };
      rec.commandMeta = JSON.stringify(meta);
      await this.agentRepo.save(rec);
      await this.appendActivityLog(id, `set_provider executed (provider: ${providerName}, model: ${modelName})`);
    }

    if (dto.type === 'start_agent') {
      // start_agent launches a long-running process — store metadata
      const meta: AgentCommandMeta = rec.commandMeta ? JSON.parse(rec.commandMeta) : {};
      meta.start_agent = { executedAt: new Date().toISOString() };
      rec.commandMeta = JSON.stringify(meta);
      await this.agentRepo.save(rec);
      await this.appendActivityLog(id, 'start_agent executed');
    }

    if (dto.type === 'stop_agent') {
      // stop_agent stops the agent process — store metadata
      const meta: AgentCommandMeta = rec.commandMeta ? JSON.parse(rec.commandMeta) : {};
      meta.stop_agent = { executedAt: new Date().toISOString() };
      rec.commandMeta = JSON.stringify(meta);
      await this.agentRepo.save(rec);
      await this.appendActivityLog(id, 'stop_agent executed');
    }

    if (dto.type === 'set_git_proxy') {
      // Substitute $downloadUrl with the host shim endpoint URL
      const downloadUrl = 'http://host.docker.internal:3000/api/git/shim';
      fullCommand = fullCommand.replace(/\$downloadUrl/g, shellEscape(downloadUrl));

      const meta: AgentCommandMeta = rec.commandMeta ? JSON.parse(rec.commandMeta) : {};
      meta.set_git_proxy = { executedAt: new Date().toISOString() };
      rec.commandMeta = JSON.stringify(meta);
      await this.agentRepo.save(rec);
      await this.appendActivityLog(id, 'set_git_proxy executed');
    }

    if (dto.type === 'add_mcp_server') {
      // Resolve the MCP server to add. Every server (built-in or remote) is
      // exposed to the agent at the CodePods proxy route /api/mcp/<slug>; the
      // agent never receives the real URL or credentials. The auth header
      // carries the agent id so the proxy (and the built-in MCP) knows the
      // caller. When mcpServerSlug is omitted, default to the built-in.
      const slug = dto.mcpServerSlug ?? 'codepods';
      const server = await this.mcpServersService.findBySlug(slug);
      if (!server) throw new NotFoundException(`MCP server "${slug}" not found`);
      if (!server.enabled) throw new BadRequestException(`MCP server "${slug}" is disabled`);

      const mcpName = server.slug;
      const mcpServerId = server.id;
      const mcpUrl = `http://host.docker.internal:3000/api/mcp/${encodeURIComponent(server.slug)}`;
      const mcpTransport = 'http';
      const mcpAuthHeader = `Authorization: Bearer ${id}`; // full header — identifies the caller to the proxy
      fullCommand = fullCommand
        .replace(/\$name/g, shellEscape(mcpName))
        .replace(/\$url/g, shellEscape(mcpUrl))
        .replace(/\$transport/g, shellEscape(mcpTransport))
        .replace(/\$authHeader/g, shellEscape(mcpAuthHeader));

      // Prepend the template's remove_mcp_server command (if defined) so the
      // add command always succeeds, even if a server with the same name
      // already exists (e.g. from a previous run or a re-config). Without
      // this, the add command may fail with "already exists" and the auth
      // header is never written to the MCP config.
      const removeCmd = commands.find((c) => c.type === 'remove_mcp_server');
      if (removeCmd) {
        const removeResolved = removeCmd.command.replace(/\$name/g, shellEscape(mcpName));
        fullCommand = `${removeResolved} 2>/dev/null || true; ${fullCommand}`;
      }

      const meta: AgentCommandMeta = rec.commandMeta ? JSON.parse(rec.commandMeta) : {};
      meta.add_mcp_server = { mcpServerSlug: mcpName, url: mcpUrl, executedAt: new Date().toISOString() };
      rec.commandMeta = JSON.stringify(meta);
      await this.agentRepo.save(rec);
      await this.appendActivityLog(id, `add_mcp_server executed (slug: ${mcpName}, url: ${mcpUrl})`);

      // Track the assignment in the N:M table.
      await this.mcpServersService.assignToAgent(id, mcpServerId);
    }

    if (dto.type === 'remove_mcp_server') {
      if (!dto.mcpServerSlug) throw new BadRequestException('mcpServerSlug is required for remove_mcp_server');
      const server = await this.mcpServersService.findBySlug(dto.mcpServerSlug);
      if (!server) throw new NotFoundException(`MCP server "${dto.mcpServerSlug}" not found`);
      fullCommand = fullCommand.replace(/\$name/g, shellEscape(server.slug));

      const meta: AgentCommandMeta = rec.commandMeta ? JSON.parse(rec.commandMeta) : {};
      meta.remove_mcp_server = { mcpServerSlug: server.slug, executedAt: new Date().toISOString() };
      rec.commandMeta = JSON.stringify(meta);
      await this.agentRepo.save(rec);
      await this.appendActivityLog(id, `remove_mcp_server executed (slug: ${server.slug})`);

      // Remove the N:M assignment (after the command runs — see below).
      await this.mcpServersService.removeFromAgent(id, server.id);
    }

    if (dto.type === 'get_mcps') {
      // No variable substitution needed — the command takes no arguments.
      // Output is parsed after execution (see below).
      const meta: AgentCommandMeta = rec.commandMeta ? JSON.parse(rec.commandMeta) : {};
      meta.get_mcps = { names: [], executedAt: new Date().toISOString() };
      rec.commandMeta = JSON.stringify(meta);
      await this.agentRepo.save(rec);
      await this.appendActivityLog(id, 'get_mcps executed');
    }

    if (dto.type === 'add_skill') {
      if (!dto.skillName) throw new BadRequestException('skillName is required for add_skill');
      if (!dto.skillSourceUrl) throw new BadRequestException('skillSourceUrl is required for add_skill');
      fullCommand = fullCommand
        .replace(/\$name/g, shellEscape(dto.skillName))
        .replace(/\$source/g, shellEscape(dto.skillSourceUrl));

      const meta: AgentCommandMeta = rec.commandMeta ? JSON.parse(rec.commandMeta) : {};
      meta.add_skill = { name: dto.skillName, sourceUrl: dto.skillSourceUrl, executedAt: new Date().toISOString() };
      rec.commandMeta = JSON.stringify(meta);
      await this.agentRepo.save(rec);
      await this.appendActivityLog(id, `add_skill executed (name: ${dto.skillName})`);
    }

    if (dto.type === 'remove_skill') {
      if (!dto.skillName) throw new BadRequestException('skillName is required for remove_skill');
      fullCommand = fullCommand.replace(/\$name/g, shellEscape(dto.skillName));

      const meta: AgentCommandMeta = rec.commandMeta ? JSON.parse(rec.commandMeta) : {};
      meta.remove_skill = { name: dto.skillName, executedAt: new Date().toISOString() };
      rec.commandMeta = JSON.stringify(meta);
      await this.agentRepo.save(rec);
      await this.appendActivityLog(id, `remove_skill executed (name: ${dto.skillName})`);
    }

    if (dto.type === 'get_skills') {
      const meta: AgentCommandMeta = rec.commandMeta ? JSON.parse(rec.commandMeta) : {};
      meta.get_skills = { names: [], executedAt: new Date().toISOString() };
      rec.commandMeta = JSON.stringify(meta);
      await this.agentRepo.save(rec);
      await this.appendActivityLog(id, 'get_skills executed');
    }

    // Execute inside the container as the manifest user with HOME set
    const container = this.docker.getContainer(rec.containerId);
    const execCtx = await this.getExecContext(id);

    // start_agent typically launches a long-running process — don't wait for it
    if (dto.type === 'start_agent') {
      const exec = await container.exec({
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        ...(execCtx.user ? { User: execCtx.user } : {}),
        Env: [`HOME=${execCtx.homeMountPath}`],
        Cmd: ['/bin/sh', '-c', fullCommand],
      });
      await exec.start({ Detach: true });
      const agent = await this.findOne(id);
      return { ...agent, commandOutput: 'start_agent launched' };
    }

    // Short command: capture (demuxed) stdout and wait for it to finish.
    let commandOutput: string;
    try {
      commandOutput = await this.execCapture(container, {
        user: execCtx.user,
        env: [`HOME=${execCtx.homeMountPath}`],
        cmd: ['/bin/sh', '-c', fullCommand],
      });
    } catch (execErr) {
      const msg = execErr instanceof Error ? execErr.message : String(execErr);
      await this.appendActivityLog(id, `${dto.type} FAILED: ${msg}`);
      throw execErr;
    }

    // Log command output (including errors) to the activity log for traceability
    if (commandOutput) {
      const preview = commandOutput.length > 500 ? commandOutput.slice(0, 500) + '…' : commandOutput;
      await this.appendActivityLog(id, `${dto.type} output: ${preview}`);
    }

    // Parse JSON-array output for get_mcps / get_skills and update metadata.
    if (dto.type === 'get_mcps' || dto.type === 'get_skills') {
      const names = this.parseNameArray(commandOutput);
      const meta: AgentCommandMeta = rec.commandMeta ? JSON.parse(rec.commandMeta) : {};
      if (dto.type === 'get_mcps') meta.get_mcps = { names, executedAt: new Date().toISOString() };
      else meta.get_skills = { names, executedAt: new Date().toISOString() };
      rec.commandMeta = JSON.stringify(meta);
      await this.agentRepo.save(rec);
    }

    const agent = await this.findOne(id);
    return { ...agent, commandOutput };
  }

  // ---- Per-agent MCP management ------------------------------------------

  /** List MCP servers assigned to an agent. */
  async listAgentMcps(id: string) {
    await this.requireAgent(id);
    return this.mcpServersService.listForAgent(id);
  }

  /** Connect an MCP server to an agent (runs add-mcp-server.sh inside the container). */
  async connectMcp(id: string, mcpServerId: number) {
    const server = await this.mcpServersService.findOne(mcpServerId);
    return this.executeCommand(id, { type: 'add_mcp_server', mcpServerSlug: server.slug });
  }

  /** Disconnect an MCP server from an agent (runs remove-mcp-server.sh). */
  async disconnectMcp(id: string, mcpServerId: number) {
    const server = await this.mcpServersService.findOne(mcpServerId);
    return this.executeCommand(id, { type: 'remove_mcp_server', mcpServerSlug: server.slug });
  }

  /** Run get-mcps.sh inside the agent and sync the N:M table with the result.
   *  Returns the list of MCP names found in the agent. */
  async syncAgentMcps(id: string): Promise<{ names: string[] }> {
    const result = await this.executeCommand(id, { type: 'get_mcps' });
    const names = this.parseNameArray(result.commandOutput ?? '');
    return { names };
  }

  // ---- Per-agent Skills management ----------------------------------------

  /** List skills assigned to an agent. */
  async listAgentSkills(id: string) {
    await this.requireAgent(id);
    return this.skillsService.listForAgent(id);
  }

  /** Connect a skill to an agent (runs add-skill inside the container). */
  async connectSkill(id: string, skillId: number) {
    const skill = await this.skillsService.findOneSkill(skillId);
    const result = await this.executeCommand(id, {
      type: 'add_skill',
      skillName: skill.name,
      skillSourceUrl: this.skillsService.skillZipUrl(skillId),
    });
    await this.skillsService.assignToAgent(id, skillId);
    return result;
  }

  /** Disconnect a skill from an agent (runs remove-skill). */
  async disconnectSkill(id: string, skillId: number) {
    const skill = await this.skillsService.findOneSkill(skillId);
    const result = await this.executeCommand(id, {
      type: 'remove_skill',
      skillName: skill.name,
    });
    await this.skillsService.removeFromAgent(id, skillId);
    return result;
  }

  /** Run get-skills inside the agent and return the names found. */
  async syncAgentSkills(id: string): Promise<{ names: string[] }> {
    const result = await this.executeCommand(id, { type: 'get_skills' });
    const names = this.parseNameArray(result.commandOutput ?? '');
    return { names };
  }

  async getContainerEnvVars(id: string): Promise<Record<string, string>> {
    const rec = await this.requireAgent(id);
    const container = this.docker.getContainer(rec.containerId);
    const info = await container.inspect();
    if (!info.State.Running) {
      throw new BadRequestException('Container is not running');
    }

    const execCtx = await this.getExecContext(id);
    const raw = await this.execCapture(container, {
      user: execCtx.user,
      env: [`HOME=${execCtx.homeMountPath}`],
      cmd: ['/bin/sh', '-c', 'printenv'],
    });
    const vars: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        vars[line.slice(0, idx)] = line.slice(idx + 1);
      }
    }
    return vars;
  }

  /** Fetch the last N lines of the agent's container logs (docker logs). */
  async getContainerLogs(id: string, tail = 500): Promise<string> {
    const rec = await this.requireAgent(id);
    const safeTail = Math.min(Math.max(1, Math.floor(tail) || 500), 5000);
    try {
      return await this.docker.getContainerLogs(rec.containerId, safeTail);
    } catch (err: unknown) {
      throw new BadRequestException(
        `Container logs unavailable: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  async updateCreationLog(id: string, creationLog: string): Promise<void> {
    const rec = await this.requireAgent(id);
    // Prepend the creation log so backend-appended activity entries are preserved
    rec.creationLog = creationLog + (rec.creationLog ? '\n' + rec.creationLog : '');
    await this.agentRepo.save(rec);
  }

  // ---- Per-agent notices ---------------------------------------------------

  /** List non-dismissed notices for an agent (most recent first). */
  async listNotices(agentId: string): Promise<AgentNotice[]> {
    await this.requireAgent(agentId);
    const entities = await this.agentNoticeRepo.find({
      where: { agentId, dismissedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return entities.map(this.toNotice);
  }

  /** Create a notice for an agent. Used internally during agent lifecycle
   *  (e.g. ACL permission errors, container exit diagnostics). */
  async createNotice(
    agentId: string,
    notice: {
      severity: AgentNoticeSeverity;
      title: string;
      message: string;
      actionLabel?: string | null;
      actionText?: string | null;
    },
  ): Promise<void> {
    await this.agentNoticeRepo.save({
      agentId,
      severity: notice.severity,
      title: notice.title,
      message: notice.message,
      actionLabel: notice.actionLabel ?? null,
      actionText: notice.actionText ?? null,
    });
  }

  /** Dismiss a notice (mark as read). */
  async dismissNotice(agentId: string, noticeId: number): Promise<void> {
    const notice = await this.agentNoticeRepo.findOne({
      where: { id: noticeId, agentId },
    });
    if (!notice) throw new NotFoundException(`Notice ${noticeId} not found for agent ${agentId}`);
    notice.dismissedAt = new Date();
    await this.agentNoticeRepo.save(notice);
  }

  private toNotice(e: AgentNoticeEntity): AgentNotice {
    return {
      id: e.id,
      agentId: e.agentId,
      severity: e.severity,
      title: e.title,
      message: e.message,
      actionLabel: e.actionLabel,
      actionText: e.actionText,
      createdAt: e.createdAt.toISOString(),
      dismissedAt: e.dismissedAt?.toISOString() ?? null,
    };
  }

  /** Append a timestamped entry to the agent's activity log. */
  private async appendActivityLog(id: string, message: string): Promise<void> {
    const rec = await this.agentRepo.findOne({ where: { id } });
    if (!rec) return;
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const line = `[${ts}] ${message}`;
    rec.creationLog = rec.creationLog ? `${rec.creationLog}\n${line}` : line;
    await this.agentRepo.save(rec);
  }

  /** Auto-connect all MCP servers flagged connectAllAgents to a freshly created
   *  agent. Only runs if the agent's template defines an add_mcp_server command. */
  private async autoConnectMcps(agentId: string, imageTemplateId: number | null): Promise<void> {
    if (!imageTemplateId) return;
    const template = await this.imageTemplateRepo.findOne({ where: { id: imageTemplateId } });
    const hasAddCmd = template?.manifest?.commands?.some((c) => c.type === 'add_mcp_server') ?? false;
    if (!hasAddCmd) return;

    const servers = await this.mcpServersService.findConnectAll();
    for (const server of servers) {
      try {
        await this.executeCommand(agentId, { type: 'add_mcp_server', mcpServerSlug: server.slug });
      } catch (e) {
        await this.appendActivityLog(
          agentId,
          `auto-connect MCP "${server.slug}" failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    }
  }

  /** Parse a JSON array of strings from command output (get_mcps / get_skills).
   *  Tolerant of extra whitespace / trailing lines. Returns [] on parse failure. */
  private parseNameArray(output: string): string[] {
    if (!output) return [];
    try {
      const parsed = JSON.parse(output.trim());
      if (Array.isArray(parsed)) {
        return parsed.filter((n): n is string => typeof n === 'string');
      }
    } catch {
      // Fall through — try line-by-line as a last resort.
    }
    return output
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  async remove(id: string, deleteWorkspace = false): Promise<void> {
    const rec = await this.agentRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException(`Agent ${id} not found`);
    const workspaceId = rec.workspaceId;
    const agentUid = rec.agentUid;
    await this.agentServiceRepo.delete({ agentId: id });
    await this.mcpServersService.removeAllFromAgent(id);
    // The container may not exist (already exited + auto-removed with --rm,
    // or never started properly). Don't let a missing container block the
    // DB cleanup — the agent record must always be deleted.
    try {
      await this.docker.removeContainer(rec.containerId);
    } catch {
      // Container already gone — proceed with DB cleanup.
    }
    this.docker.unregisterAgent(rec.containerId);
    await this.agentRepo.delete(id);

    // Always delete the agent's home directory (not optional, unlike workspace).
    this.homesService.removeHome(id);

    // Decide whether the workspace survives this removal (it's only deleted when
    // explicitly requested AND no other agent references it).
    let workspaceSurvives = false;
    if (deleteWorkspace && workspaceId !== null) {
      const otherAgents = await this.agentRepo.count({
        where: { workspaceId },
      });
      if (otherAgents === 0) {
        await this.workspacesService.remove(workspaceId, rec.codepodId);
      } else {
        workspaceSurvives = true;
      }
    } else if (workspaceId !== null) {
      workspaceSurvives = true;
    }

    // Conditionally revoke the agent's workspace ACL entry: only revoke when the
    // workspace still exists AND no other remaining agent on it shares the same
    // agentUid (a co-tenant using the same image/uid must keep its grant).
    if (workspaceSurvives && agentUid !== null) {
      const sameUid = await this.agentRepo.count({
        where: { workspaceId: workspaceId!, agentUid },
      });
      if (sameUid === 0) {
        const ws = await this.workspacesService.findOne(workspaceId!, rec.codepodId);
        if (ws?.path) {
          await this.workspacesService.revokeAgentAccess(ws.path, agentUid);
        }
      }
    }
  }

  async listServices(agentId: string): Promise<AgentService[]> {
    await this.requireAgent(agentId);
    const records = await this.agentServiceRepo.find({
      where: { agentId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return records.map((record) => this.mapAgentService(record));
  }

  async createService(agentId: string, dto: CreateAgentServiceDto): Promise<AgentService> {
    const agent = await this.requireAgent(agentId);
    await this.assertServiceNameAvailable(agentId, dto.name);
    const created = await this.agentServiceRepo.save({
      agentId,
      codepodId: agent.codepodId,
      type: dto.type,
      name: dto.name,
      port: dto.port,
    });
    return this.mapAgentService(created);
  }

  async updateService(agentId: string, serviceId: number, dto: UpdateAgentServiceDto): Promise<AgentService> {
    await this.requireAgent(agentId);
    const current = await this.agentServiceRepo.findOne({ where: { id: serviceId, agentId } });
    if (!current) throw new NotFoundException(`Service ${serviceId} not found for agent ${agentId}`);

    current.type = dto.type ?? current.type;
    current.port = dto.port ?? current.port;
    if (dto.name !== undefined && dto.name !== current.name) {
      await this.assertServiceNameAvailable(agentId, dto.name, serviceId);
      current.name = dto.name;
    }
    const saved = await this.agentServiceRepo.save(current);
    return this.mapAgentService(saved);
  }

  async removeService(agentId: string, serviceId: number): Promise<void> {
    await this.requireAgent(agentId);
    const result = await this.agentServiceRepo.delete({ id: serviceId, agentId });
    if (!result.affected) {
      throw new NotFoundException(`Service ${serviceId} not found for agent ${agentId}`);
    }
  }

  async findByName(name: string, codepodId = 1): Promise<AgentEntity | null> {
    return this.agentRepo.findOne({ where: { name, codepodId } });
  }

  /** Resolve agent by name with workspace info (for git proxy). */
  async resolveByName(
    name: string,
    codepodId = 1,
  ): Promise<{ workspaceId: number | null; mountPath: string; codepodId: number } | null> {
    const rec = await this.agentRepo.findOne({ where: { name, codepodId } });
    if (!rec) return null;
    return this.toResolvedAgent(rec);
  }

  /** Resolve agent by stable id with workspace info (for git proxy). */
  async resolveById(
    id: string,
    codepodId = 1,
  ): Promise<{ workspaceId: number | null; mountPath: string; codepodId: number } | null> {
    const rec = await this.agentRepo.findOne({ where: { id, codepodId } });
    if (!rec) return null;
    return this.toResolvedAgent(rec);
  }

  private async toResolvedAgent(
    rec: AgentEntity,
  ): Promise<{ workspaceId: number | null; mountPath: string; codepodId: number } | null> {
    const template = rec.imageTemplateId
      ? await this.imageTemplateRepo.findOne({ where: { id: rec.imageTemplateId } })
      : null;
    return {
      workspaceId: rec.workspaceId,
      mountPath: this.mountPathFromTemplate(template),
      codepodId: rec.codepodId,
    };
  }

  async findServiceByName(agentId: string, name: string): Promise<AgentServiceEntity | null> {
    return this.agentServiceRepo.findOne({ where: { agentId, name } });
  }

  private async saveAgentUnique(entity: Partial<AgentEntity>): Promise<AgentEntity> {
    try {
      const record = this.agentRepo.create(entity);
      return await this.agentRepo.save(record);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('UNIQUE')) {
        throw new ConflictException(
          `Agent name "${entity.name ?? ''}" already exists in this codepod.`,
        );
      }
      throw error;
    }
  }

  private async assertServiceNameAvailable(
    agentId: string,
    name: string,
    excludeId?: number,
  ): Promise<void> {
    const qb = this.agentServiceRepo
      .createQueryBuilder('service')
      .where('service.agentId = :agentId', { agentId })
      .andWhere('LOWER(service.name) = LOWER(:name)', { name });

    if (excludeId !== undefined) {
      qb.andWhere('service.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `Service name "${name}" already exists for this agent.`,
      );
    }
  }

  private async resolveImageForAgent(dto: CreateAgentDto): Promise<{
    imageRef: string;
    services: Array<{ type: 'terminal' | 'web'; name: string; port: number }>;
    workspaceMountPath: string;
    homeMountPath: string;
  }> {
    if (dto.imageTemplateId !== undefined) {
      return this.imagesService.ensureImageForAgentCreation(
        dto.imageTemplateId,
        dto.updateImageIfOutdated ?? false,
        dto.allowOutdatedImage ?? false,
      );
    }

    const image = dto.image?.trim();
    if (!image) {
      throw new BadRequestException(
        'Either "image" or "imageTemplateId" must be provided to create an agent.',
      );
    }
    return { imageRef: image, services: [], workspaceMountPath: '/workspace', homeMountPath: '/home/agent' };
  }

  async getContainerId(agentId: string): Promise<string> {
    const rec = await this.requireAgent(agentId);
    return rec.containerId;
  }

  /**
   * Resolve the `--user` value (numeric uid:gid) + in-container home path for an
   * agent, used to run `docker exec` (and the interactive console) as the same uid
   * the container runs as, with the correct HOME. When the agent was created with
   * a dedicated logical uid (`agentUid` persisted), that uid is used; otherwise the
   * agent runs as the API process's own uid.
   */
  async getExecContext(agentId: string): Promise<{ user: string; homeMountPath: string }> {
    const rec = await this.requireAgent(agentId);
    const template = rec.imageTemplateId
      ? await this.imageTemplateRepo.findOne({ where: { id: rec.imageTemplateId } })
      : null;
    const user = this.runUserSpec(rec.agentUid);
    const homeMountPath = this.homeMountPathFromTemplate(template) ?? '/home/agent';
    return { user, homeMountPath };
  }

  /**
   * Assign a per-agent logical uid: a random value in the configured range
   * (`agentUidRange`, default 55001-65000), collision-checked against existing
   * `agentUid` values in the DB (a random pick + check avoids a newly-created
   * agent inheriting a just-deleted agent's stale ACL entries until cleanup
   * processes exist). Retries up to 16 times; throws if the range is exhausted.
   */
  private async assignAgentUid(): Promise<number> {
    const { start, end } = this.configService.get('docker').agentUidRange;
    const span = Math.max(0, end - start + 1);
    for (let attempt = 0; attempt < 16; attempt++) {
      const uid = start + Math.floor(Math.random() * span);
      const collision = await this.agentRepo.count({ where: { agentUid: uid } });
      if (collision === 0) return uid;
    }
    throw new Error('Could not assign a non-colliding agent uid (range exhausted?).');
  }

  /**
   * The `--user` value for `docker run`/`docker exec`: the agent's dedicated logical
   * uid (`uid:uid`, no separate group) when assigned, otherwise the API process's own
   * uid:gid (experimental non-isolated mode — the agent IS the home/workspace owner).
   */
  private runUserSpec(agentUid: number | null): string {
    if (agentUid !== null) return `${agentUid}:${agentUid}`;
    // Toggle-off mode: run as the API process's own uid (the home/workspace owner,
    // so writes are native — no ACL needed). Falls back to 0 on platforms without
    // getuid/getgid (the API is Linux-targeted, so these are always present).
    const uid = process.getuid?.() ?? 0;
    const gid = process.getgid?.() ?? 0;
    return `${uid}:${gid}`;
  }

  /**
   * Run a short command inside a container via `docker exec` and return its
   * stdout as clean text. Docker frames non-Tty exec output with an 8-byte
   * header per chunk (the multiplexed stream protocol), so reading the raw
   * stream mixes those binary headers into the payload — which broke the
   * `id -u`/`id -g` parse (and left garbage in command output). We demux the
   * framed stream with the modem helper to get clean stdout; stderr is
   * discarded. Falls back to raw passthrough when no modem is available (e.g.
   * in tests with an already-clean stream).
   */
  private async execCapture(
    container: import('dockerode').Container,
    opts: { user?: string | null; env?: string[]; cmd: string[] },
  ): Promise<string> {
    const exec = await container.exec({
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      ...(opts.user ? { User: opts.user } : {}),
      ...(opts.env ? { Env: opts.env } : {}),
      Cmd: opts.cmd,
    });
    const stream = await exec.start({ hijack: false });

    // Collect stdout and stderr separately as demuxStream writes each frame.
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const stdout = new Writable({
      write: (chunk: Buffer, _enc, cb) => {
        stdoutChunks.push(chunk);
        cb();
      },
    });
    const stderr = new Writable({
      write: (chunk: Buffer, _enc, cb) => {
        stderrChunks.push(chunk);
        cb();
      },
    });

    const modem = (container as unknown as { modem?: { demuxStream?: (a: unknown, b: unknown, c: unknown) => void } }).modem;
    if (modem && typeof modem.demuxStream === 'function') {
      modem.demuxStream(stream, stdout, stderr);
    } else {
      // No demuxer available: assume the stream is already clean (raw stdout).
      stream.on('data', (c: Buffer) => stdout.write(c));
    }

    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('close', resolve);
      stream.on('error', reject);
    });

    const stdoutText = Buffer.concat(stdoutChunks).toString('utf-8').trim();
    const stderrText = Buffer.concat(stderrChunks).toString('utf-8').trim();

    // Check exit code — if non-zero, include stderr for diagnostics.
    const execInfo = await exec.inspect();
    if (execInfo.ExitCode !== 0) {
      const cmdPreview = opts.cmd.join(' ').slice(0, 200);
      const detail = stderrText || stdoutText || '(no output)';
      throw new Error(`Command failed (exit ${execInfo.ExitCode}): ${cmdPreview}\n${detail}`);
    }

    return stdoutText || stderrText;
  }

  private async requireAgent(agentId: string): Promise<AgentEntity> {
    const agent = await this.agentRepo.findOne({ where: { id: agentId } });
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
    return agent;
  }

  private mapAgentService(record: AgentServiceEntity): AgentService {
    return {
      id: record.id,
      agentId: record.agentId,
      codepodId: record.codepodId,
      type: record.type,
      name: record.name,
      port: record.port,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /** Batch-update manual sort order. Assigns sequential sortOrder (1-based). */
  async reorder(ids: string[], codepodId = 1): Promise<void> {
    await this.agentRepo.manager.transaction(async (tx) => {
      // Reset every agent of this codepod to unordered; the listed ids below
      // receive a sequential sortOrder. Agents absent from `ids` (unpinned)
      // fall back to sortOrder 0 so they render as loose items in the UI.
      await tx.update(AgentEntity, { codepodId }, { sortOrder: 0 });
      for (let i = 0; i < ids.length; i++) {
        await tx.update(AgentEntity, { id: ids[i], codepodId }, { sortOrder: i + 1 });
      }
    });
  }

  private buildAgentResponse(
    record: AgentEntity,
    status: AgentStatus,
    ports: PortBinding[],
    template: ImageTemplateEntity | null | undefined,
    workspace?: { name: string; slug: string; mountPath: string } | null,
    services?: AgentService[],
  ): Agent {
    return {
      id: record.id,
      containerId: record.containerId,
      name: record.name,
      image: record.image,
      status,
      codepodId: record.codepodId,
      ports,
      createdAt: record.createdAt.toISOString(),
      imageTemplateId: record.imageTemplateId,
      templateName: template?.name ?? null,
      templateIcon: template?.icon ?? null,
      templateIconDark: template?.iconDark ?? null,
      envVars: record.envVars ? JSON.parse(record.envVars) : null,
      commandMeta: record.commandMeta ? JSON.parse(record.commandMeta) : null,
      templateCommands: template?.manifest?.commands ?? null,
      creationLog: record.creationLog,
      workspaceId: record.workspaceId ?? null,
      workspaceName: workspace?.name ?? null,
      workspaceSlug: workspace?.slug ?? null,
      workspaceMountPath: workspace?.mountPath ?? null,
      services: services ?? [],
      dockerRunConfig: record.dockerRunConfig ? safeParseDockerConfig(record.dockerRunConfig) : null,
      homePath: record.homePath ?? null,
      homeMountPath: this.homeMountPathFromTemplate(template),
      agentUid: record.agentUid ?? null,
      agentGid: record.agentGid ?? null,
      sortOrder: record.sortOrder ?? 0,
    };
  }

  /** Read the in-container mount path from a template manifest (default /workspace). */
  private mountPathFromTemplate(template: ImageTemplateEntity | null | undefined): string {
    const wp = template?.manifest?.workspace_path;
    return typeof wp === 'string' && wp.trim() !== '' ? wp.trim() : '/workspace';
  }

  /** Read the in-container home mount path from a template manifest (home_path). */
  private homeMountPathFromTemplate(template: ImageTemplateEntity | null | undefined): string | null {
    const hp = template?.manifest?.home_path;
    return typeof hp === 'string' && hp.trim() !== '' ? hp.trim() : null;
  }

  /**
   * Returns the egress configuration for agent containers.
   *
   * Agents ALWAYS run on the internal `codepods-agents` network with the
   * egress proxy as their gateway. The proxy handles two functions:
   *  - API forwarding (always ON) — injects X-Agent-Id + X-Agent-Sig
   *  - Internet filtering (when `filterInternetEgress` is ON)
   *
   * `NO_PROXY` excludes only localhost/127.0.0.1 — `host.docker.internal` is
   * NOT excluded, so all container→host traffic goes through the proxy where
   * agent identity is injected (ADR-036).
   *
   * On the `--internal` agent network the `host-gateway` token does not
   * reliably resolve, so we bind `host.docker.internal` to the network's
   * explicit gateway IP (the host's interface on the bridge — reachable even
   * on internal networks).
   */
  private async egressConfig(): Promise<{
    env: string[];
    networkMode: string | null;
    extraHosts: string[];
  }> {
    const net = this.configService.get('networkSecurity');
    const proxy = `http://host.docker.internal:${net.proxyPort}`;
    // Resolve the internal network's gateway IP so host.docker.internal is
    // reachable from the (internal) agent network. Fall back to the host-gateway
    // token if the IP cannot be determined.
    const gw = await this.docker.getNetworkGateway(DockerService.AGENT_NETWORK, true);
    const hostEntry = gw
      ? `host.docker.internal:${gw}`
      : 'host.docker.internal:host-gateway';
    return {
      env: [
        `HTTP_PROXY=${proxy}`,
        `HTTPS_PROXY=${proxy}`,
        `http_proxy=${proxy}`,
        `https_proxy=${proxy}`,
        // host.docker.internal is NOT excluded — all container→host traffic
        // goes through the proxy for agent identity injection (ADR-036).
        `NO_PROXY=localhost,127.0.0.1`,
        `no_proxy=localhost,127.0.0.1`,
      ],
      networkMode: DockerService.AGENT_NETWORK,
      extraHosts: [hostEntry],
    };
  }

  /**
   * Recreate a container for an ephemeral agent (--rm) using the CURRENT docker
   * config. Updates the stored snapshot + containerId so the agent always shows
   * the latest configuration used. Reuses the persisted home + workspace binds.
   */
  private async recreateContainer(rec: AgentEntity): Promise<void> {
    const dockerConfig = this.configService.get('docker');
    // Reuse the persisted logical uid when the toggle is on; if the toggle was off
    // at creation (agentUid null) but is now on, assign a fresh uid. When the toggle
    // is off, run as the API process's own uid (agentUid stays null).
    let agentUid = rec.agentUid;
    if (dockerConfig.forceNonRootUser && agentUid === null) {
      agentUid = await this.assignAgentUid();
    }
    if (!dockerConfig.forceNonRootUser) {
      agentUid = null;
    }
    const agentGid = agentUid;
    const userSpec = this.runUserSpec(agentUid);
    const dockerOpts = buildDockerCreateOptions(dockerConfig, userSpec, this.configService.get('docker').dropNetRaw);
    const egress = await this.egressConfig();

    // Reconstruct binds: home is always present; workspace if associated.
    const binds: string[] = [];
    const template = rec.imageTemplateId
      ? await this.imageTemplateRepo.findOne({ where: { id: rec.imageTemplateId } })
      : null;
    const homeMountPath = this.homeMountPathFromTemplate(template) ?? '/home/agent';
    if (rec.homePath) binds.push(`${rec.homePath}:${homeMountPath}`);
    const ws =
      rec.workspaceId !== null
        ? await this.workspacesService.findOne(rec.workspaceId, rec.codepodId)
        : null;
    if (ws?.path) binds.push(`${ws.path}:${this.mountPathFromTemplate(template)}`);

    // Reconstruct port bindings from snapshot.
    const ports: PortBinding[] = rec.portBindings ? JSON.parse(rec.portBindings) : [];

    // Reconstruct env vars.
    const envVars: Record<string, string> = rec.envVars ? JSON.parse(rec.envVars) : {};

    const container = await this.docker.createContainer({
      name: rec.name,
      Image: rec.image,
      Env: [
        ...Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
        `CODEPODS_AGENT_NAME=${rec.name}`,
        `CODEPODS_AGENT_ID=${rec.id}`,
        `CODEPODS_API_URL=http://host.docker.internal:3000/api`,
        ...egress.env,
      ],
      ExposedPorts: ports.reduce(
        (acc, p) => ({ ...acc, [`${p.containerPort}/${p.protocol ?? 'tcp'}`]: {} }),
        {},
      ),
      ...dockerOpts.topLevel,
      HostConfig: {
        PortBindings: ports.reduce(
          (acc, p) => ({
            ...acc,
            [`${p.containerPort}/${p.protocol ?? 'tcp'}`]: [{ HostPort: String(p.hostPort) }],
          }),
          {},
        ),
        ExtraHosts: egress.extraHosts,
        Binds: binds,
        ...(egress.networkMode ? { NetworkMode: egress.networkMode } : {}),
        ...dockerOpts.hostConfig,
      },
    });

    // Apply ACL grants BEFORE starting so the agent can write to its home
    // immediately when the entrypoint runs.
    if (agentUid !== null) {
      if (rec.homePath) await this.workspacesService.grantAgentAccess(rec.homePath, agentUid);
      if (ws?.path) await this.workspacesService.grantAgentAccess(ws.path, agentUid);
    }

    await container.start();
    const info = await container.inspect();

    if (!info.State?.Running) {
      const exitCode = info.State?.ExitCode ?? '?';
      let logTail = '';
      try {
        logTail = await this.docker.getContainerLogs(info.Id, 50);
      } catch {
        // ignore
      }
      await this.appendActivityLog(
        rec.id,
        `Container exited immediately after start (exit code: ${exitCode})${logTail ? `\nContainer logs:\n${logTail}` : ''}`,
      );
    }

    // Update the stored snapshot + containerId to reflect current config.
    rec.containerId = info.Id;
    rec.dockerRunConfig = JSON.stringify(dockerConfig);
    rec.agentUid = agentUid;
    rec.agentGid = agentGid;
    await this.agentRepo.save(rec);

    // Register the container's IP for agent identification by the egress proxy.
    await this.docker.registerAgentIp(info.Id, rec.id);
  }
}

/** Shell-escape a value for safe substitution into a shell command. */
function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Convert a DockerRunConfig into dockerode-compatible container create options.
 * Returns `topLevel` (User, Runtime) and `hostConfig` (everything in HostConfig).
 *
 * `userSpec` is the resolved `--user` value (`uid:gid`): either the agent's
 * dedicated logical uid (toggle on) or the API process's own uid (toggle off).
 */
function buildDockerCreateOptions(cfg: DockerRunConfig, userSpec: string | null, dropNetRaw: boolean): {
  topLevel: Record<string, unknown>;
  hostConfig: Record<string, unknown>;
} {
  const hostConfig: Record<string, unknown> = {};
  const topLevel: Record<string, unknown> = {};

  if (cfg.autoRemove) hostConfig.AutoRemove = true;
  if (cfg.readOnly) hostConfig.ReadonlyRootfs = true;
  if (cfg.tmpfsSize) hostConfig.Tmpfs = { '/tmp': `size=${cfg.tmpfsSize}` };
  if (cfg.capDropAll) hostConfig.CapDrop = ['ALL'];
  // CAP_NET_RAW is dropped separately so it's configurable independently
  // (dropNetRaw, default true). When capDropAll is already true, NET_RAW
  // is already covered — only add it when capDropAll is false.
  if (dropNetRaw && !cfg.capDropAll) {
    const existing = (hostConfig.CapDrop as string[] | undefined) ?? [];
    hostConfig.CapDrop = [...existing, 'NET_RAW'];
  }
  if (cfg.noNewPrivileges) hostConfig.SecurityOpt = ['no-new-privileges'];
  if (cfg.pidsLimit !== null && cfg.pidsLimit > 0) hostConfig.PidsLimit = cfg.pidsLimit;
  if (cfg.memoryLimit) {
    const bytes = parseMemoryLimit(cfg.memoryLimit);
    if (bytes > 0) hostConfig.Memory = bytes;
  }
  if (cfg.cpuLimit > 0) hostConfig.NanoCpus = Math.round(cfg.cpuLimit * 1e9);
  if (cfg.runtime) topLevel.Runtime = cfg.runtime;
  // Always run as a non-root uid: the agent's dedicated logical uid (toggle on,
  // ACL-granted to home+workspace) or the API process's own uid (toggle off,
  // native writes as the owner). The manifest `user` is never used.
  if (userSpec) topLevel.User = userSpec;

  return { topLevel, hostConfig };
}

/** Parse a memory limit string like `512m` or `2g` into bytes. */
function parseMemoryLimit(s: string): number {
  const match = s.trim().match(/^(\d+)\s*([kmg])?$/i);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === 'k' ? 1024 : unit === 'm' ? 1024 * 1024 : unit === 'g' ? 1024 * 1024 * 1024 : 1;
  return value * multiplier;
}

/** Human-readable summary of the actual docker run command, including mounts. */
function summarizeDockerRun(params: {
  image: string;
  binds: string[];
  userSpec: string | null;
  envCount: number;
  networkMode: string | null;
  dockerConfig: DockerRunConfig;
}): string {
  const parts: string[] = [`image=${params.image}`];
  // Security options from the global config
  const cfg = params.dockerConfig;
  const secParts: string[] = [];
  if (cfg.autoRemove) secParts.push('--rm');
  if (cfg.readOnly) secParts.push('--read-only');
  if (cfg.tmpfsSize) secParts.push(`--tmpfs /tmp:size=${cfg.tmpfsSize}`);
  if (cfg.capDropAll) secParts.push('--cap-drop=ALL');
  if (cfg.noNewPrivileges) secParts.push('--security-opt no-new-privileges');
  if (cfg.pidsLimit !== null && cfg.pidsLimit > 0) secParts.push(`--pids-limit ${cfg.pidsLimit}`);
  if (cfg.memoryLimit) secParts.push(`--memory ${cfg.memoryLimit}`);
  if (cfg.cpuLimit > 0) secParts.push(`--cpus ${cfg.cpuLimit}`);
  if (cfg.runtime) secParts.push(`--runtime=${cfg.runtime}`);
  if (secParts.length > 0) parts.push(secParts.join(' '));
  // User
  parts.push(`--user ${params.userSpec ?? '<default>'}`);
  // Mounts (the key info that was missing)
  parts.push(`mounts=[${params.binds.join(', ')}]`);
  // Env summary (don't log values — they may contain secrets)
  parts.push(`env=${params.envCount} vars`);
  // Network mode
  if (params.networkMode) parts.push(`--network ${params.networkMode}`);
  if (cfg.customArgs) parts.push(`[custom: ${cfg.customArgs}]`);
  return parts.join(' ');
}

/** Safely parse a stored docker run config JSON, returning null on failure. */
function safeParseDockerConfig(json: string): DockerRunConfig | null {
  try {
    return JSON.parse(json) as DockerRunConfig;
  } catch {
    return null;
  }
}
