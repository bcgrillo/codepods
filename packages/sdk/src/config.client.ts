import { authHeaders, notifyUnauthorized } from './auth';
import type {
  CodepodsConfigDto,
  AgentsMd,
  CreateAgentsMdDto,
  UpdateAgentsMdDto,
  TempException,
  CreateTempExceptionDto,
} from '@codepods/shared-types';

export class ConfigClient {
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
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  getConfig(): Promise<CodepodsConfigDto> {
    return this.request<CodepodsConfigDto>('/config');
  }

  updateConfig(values: Partial<CodepodsConfigDto>): Promise<CodepodsConfigDto> {
    return this.request<CodepodsConfigDto>('/config', {
      method: 'PATCH',
      body: JSON.stringify(values),
    });
  }

  reloadConfig(): Promise<CodepodsConfigDto> {
    return this.request<CodepodsConfigDto>('/config/reload', { method: 'POST' });
  }

  // --- AgentsMd ---

  listAgentsMd(): Promise<AgentsMd[]> {
    return this.request<AgentsMd[]>('/agents-md');
  }

  getDefaultAgentsMd(): Promise<AgentsMd | null> {
    return this.request<AgentsMd | null>('/agents-md/default');
  }

  getAgentsMd(id: number): Promise<AgentsMd> {
    return this.request<AgentsMd>(`/agents-md/${id}`);
  }

  createAgentsMd(dto: CreateAgentsMdDto): Promise<AgentsMd> {
    return this.request<AgentsMd>('/agents-md', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  updateAgentsMd(id: number, dto: UpdateAgentsMdDto): Promise<AgentsMd> {
    return this.request<AgentsMd>(`/agents-md/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  setDefaultAgentsMd(id: number): Promise<void> {
    return this.request<void>(`/agents-md/${id}/set-default`, { method: 'POST' });
  }

  removeAgentsMd(id: number): Promise<void> {
    return this.request<void>(`/agents-md/${id}`, { method: 'DELETE' });
  }

  // --- Egress temp exceptions ---

  listTempExceptions(): Promise<TempException[]> {
    return this.request<TempException[]>('/egress/temp-exceptions');
  }

  createTempException(dto: CreateTempExceptionDto): Promise<TempException> {
    return this.request<TempException>('/egress/temp-exception', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  revokeTempException(host: string): Promise<void> {
    return this.request<void>(`/egress/temp-exception/${encodeURIComponent(host)}`, { method: 'DELETE' });
  }
}