import { authHeaders, notifyUnauthorized } from './auth';
import type {
  Agent,
  AgentService,
  AgentNotice,
  AgentRequest,
  CreateAgentServiceDto,
  CreateAgentDto,
  CreateImageTemplateDto,
  ImageTemplate,
  SetupStatus,
  UpdateImageTemplateDto,
  UpdateAgentServiceDto,
  UpdateAgentEnvVarsDto,
  ExecuteAgentCommandDto,
  ExecuteAgentCommandResult,
  McpServer,
  AgentMcpTools,
  Skill,
} from '@codepods/shared-types';

export class AgentsClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
      ...init,
    });
    if (!res.ok) {
      if (res.status === 401) notifyUnauthorized();
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  listAgents(): Promise<Agent[]> {
    return this.request<Agent[]>('/agents');
  }

  reorderAgents(ids: string[]): Promise<void> {
    return this.request<void>('/agents/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  getAgent(id: string): Promise<Agent> {
    return this.request<Agent>(`/agents/${id}`);
  }

  createAgent(dto: CreateAgentDto): Promise<Agent> {
    return this.request<Agent>('/agents', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  startAgent(id: string): Promise<void> {
    return this.request<void>(`/agents/${id}/start`, { method: 'POST' });
  }

  stopAgent(id: string): Promise<void> {
    return this.request<void>(`/agents/${id}/stop`, { method: 'POST' });
  }

  restartAgent(id: string): Promise<Agent> {
    return this.request<Agent>(`/agents/${id}/restart`, { method: 'POST' });
  }

  recreateAgent(id: string): Promise<Agent> {
    return this.request<Agent>(`/agents/${id}/recreate`, { method: 'POST' });
  }

  renameAgent(id: string, name: string): Promise<Agent> {
    return this.request<Agent>(`/agents/${id}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  updateAgentEnvVars(id: string, dto: UpdateAgentEnvVarsDto): Promise<Agent> {
    return this.request<Agent>(`/agents/${id}/env-vars`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  executeAgentCommand(id: string, dto: ExecuteAgentCommandDto): Promise<ExecuteAgentCommandResult> {
    return this.request<ExecuteAgentCommandResult>(`/agents/${id}/execute-command`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  getAgentContainerEnvVars(id: string): Promise<Record<string, string>> {
    return this.request<Record<string, string>>(`/agents/${id}/container-env`);
  }

  getAgentContainerLogs(id: string, tail = 500): Promise<{ logs: string }> {
    return this.request<{ logs: string }>(`/agents/${id}/container-logs?tail=${tail}`);
  }

  updateAgentCreationLog(id: string, creationLog: string): Promise<void> {
    return this.request<void>(`/agents/${id}/creation-log`, {
      method: 'PATCH',
      body: JSON.stringify({ creationLog }),
    });
  }

  removeAgent(id: string, deleteWorkspace = false): Promise<void> {
    const qs = deleteWorkspace ? '?deleteWorkspace=true' : '';
    return this.request<void>(`/agents/${id}${qs}`, { method: 'DELETE' });
  }

  listAgentServices(agentId: string): Promise<AgentService[]> {
    return this.request<AgentService[]>(`/agents/${agentId}/services`);
  }

  getAgentServiceProxyUrl(agentName: string, serviceName: string): string {
    return `${this.baseUrl}/proxy/${encodeURIComponent(agentName)}/${encodeURIComponent(serviceName)}/`;
  }

  createAgentService(agentId: string, dto: CreateAgentServiceDto): Promise<AgentService> {
    return this.request<AgentService>(`/agents/${agentId}/services`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  updateAgentService(
    agentId: string,
    serviceId: number,
    dto: UpdateAgentServiceDto,
  ): Promise<AgentService> {
    return this.request<AgentService>(`/agents/${agentId}/services/${serviceId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  removeAgentService(agentId: string, serviceId: number): Promise<void> {
    return this.request<void>(`/agents/${agentId}/services/${serviceId}`, {
      method: 'DELETE',
    });
  }

  // ---- Per-agent MCP management ----

  listAgentMcps(agentId: string): Promise<McpServer[]> {
    return this.request<McpServer[]>(`/agents/${agentId}/mcps`);
  }

  connectAgentMcp(agentId: string, mcpServerId: number): Promise<ExecuteAgentCommandResult> {
    return this.request<ExecuteAgentCommandResult>(`/agents/${agentId}/mcps/${mcpServerId}`, {
      method: 'POST',
    });
  }

  disconnectAgentMcp(agentId: string, mcpServerId: number): Promise<void> {
    return this.request<void>(`/agents/${agentId}/mcps/${mcpServerId}`, { method: 'DELETE' });
  }

  syncAgentMcps(agentId: string): Promise<{ names: string[] }> {
    return this.request<{ names: string[] }>(`/agents/${agentId}/mcps/sync`, { method: 'POST' });
  }

  /** Cached per-agent MCP tool inventory for the UI (`GET /agents/:id/mcp-tools`). */
  listAgentMcpTools(agentId: string): Promise<AgentMcpTools[]> {
    return this.request<AgentMcpTools[]>(`/agents/${agentId}/mcp-tools`);
  }

  // ---- Per-agent Skills management ----

  listAgentSkills(agentId: string): Promise<Skill[]> {
    return this.request<Skill[]>(`/agents/${agentId}/skills`);
  }

  connectAgentSkill(agentId: string, skillId: number): Promise<ExecuteAgentCommandResult> {
    return this.request<ExecuteAgentCommandResult>(`/agents/${agentId}/skills/${skillId}`, {
      method: 'POST',
    });
  }

  disconnectAgentSkill(agentId: string, skillId: number): Promise<void> {
    return this.request<void>(`/agents/${agentId}/skills/${skillId}`, { method: 'DELETE' });
  }

  syncAgentSkills(agentId: string): Promise<{ names: string[] }> {
    return this.request<{ names: string[] }>(`/agents/${agentId}/skills/sync`, { method: 'POST' });
  }

  listAgentNotices(agentId: string): Promise<AgentNotice[]> {
    return this.request<AgentNotice[]>(`/agents/${agentId}/notices`, { method: 'GET' });
  }

  dismissAgentNotice(agentId: string, noticeId: number): Promise<void> {
    return this.request<void>(`/agents/${agentId}/notices/${noticeId}/dismiss`, { method: 'POST' });
  }

  listAgentRequests(agentId: string): Promise<AgentRequest[]> {
    return this.request<AgentRequest[]>(`/agents/${agentId}/requests`, { method: 'GET' });
  }

  approveAgentRequest(agentId: string, requestId: number, durationMinutes?: number): Promise<AgentRequest> {
    return this.request<AgentRequest>(`/agents/${agentId}/requests/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMinutes }),
    });
  }

  rejectAgentRequest(agentId: string, requestId: number): Promise<AgentRequest> {
    return this.request<AgentRequest>(`/agents/${agentId}/requests/${requestId}/reject`, { method: 'POST' });
  }

  getSetupStatus(): Promise<SetupStatus> {
    return this.request<SetupStatus>('/setup/status');
  }

  listImageTemplates(): Promise<ImageTemplate[]> {
    return this.request<ImageTemplate[]>('/images');
  }

  reorderImageTemplates(ids: number[]): Promise<void> {
    return this.request<void>('/images/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  getImageTemplate(id: number): Promise<ImageTemplate> {
    return this.request<ImageTemplate>(`/images/${id}`);
  }

  createImageTemplate(dto: CreateImageTemplateDto): Promise<ImageTemplate> {
    return this.request<ImageTemplate>('/images', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  updateImageTemplate(id: number, dto: UpdateImageTemplateDto): Promise<ImageTemplate> {
    return this.request<ImageTemplate>(`/images/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  removeImageTemplate(id: number): Promise<void> {
    return this.request<void>(`/images/${id}`, { method: 'DELETE' });
  }

  ensureImageTemplate(id: number, update = false, checkOnly = false) {
    const params = new URLSearchParams();
    if (update) params.set('update', 'true');
    if (checkOnly) params.set('checkOnly', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      imageRef: string;
      action: 'existing' | 'built' | 'missing';
      needsUpdate: boolean;
      currentCommit: string;
      currentTag: string | null;
      builtCommit: string | null;
      builtTag: string | null;
      buildOutput: string[];
    }>(`/images/${id}/ensure${qs}`, {
      method: 'POST',
    });
  }

  async ensureImageTemplateStream(
    id: number,
    update: boolean,
    onProgress: (line: string) => void,
    checkOnly = false,
  ): Promise<{
    imageRef: string;
    action: 'existing' | 'built' | 'missing';
    needsUpdate: boolean;
    currentCommit: string;
    currentTag: string | null;
    builtCommit: string | null;
    builtTag: string | null;
    buildOutput: string[];
  }> {
    const params = new URLSearchParams();
    if (update) params.set('update', 'true');
    if (checkOnly) params.set('checkOnly', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${this.baseUrl}/images/${id}/ensure-stream${qs}`, {
      method: 'POST',
      headers: { accept: 'text/event-stream', ...authHeaders() },
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: {
      imageRef: string;
      action: 'existing' | 'built' | 'missing';
      needsUpdate: boolean;
      currentCommit: string;
      currentTag: string | null;
      builtCommit: string | null;
      builtTag: string | null;
      buildOutput: string[];
    } | null = null;
    let error: Error | null = null;

    const parseEvents = (chunk: string) => {
      buffer += chunk;
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const lines = part.split('\n');
        let event = 'message';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) event = line.slice(7);
          else if (line.startsWith('data: ')) data = line.slice(6);
        }
        if (!data) continue;
        const parsed = JSON.parse(data);
        if (event === 'progress') {
          onProgress(parsed.line);
        } else if (event === 'done') {
          result = parsed;
        } else if (event === 'error') {
          error = new Error(parsed.message ?? 'Build failed');
          (error as Error & { response?: unknown }).response = parsed;
        }
      }
    };

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parseEvents(decoder.decode(value, { stream: true }));
    }
    parseEvents(decoder.decode());

    if (error) throw error;
    if (!result) throw new Error('Stream ended without result');
    return result;
  }
}
