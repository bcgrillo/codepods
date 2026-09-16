import { authHeaders, notifyUnauthorized } from './auth';
import type {
  SystemStats,
  AgentStats,
  ContainerInfo,
  CleanupCheckResult,
} from '@codepods/shared-types';

export class SystemClient {
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

  getSystemStats(): Promise<SystemStats> {
    return this.request<SystemStats>('/system/stats');
  }

  getAgentStats(includeNonCodepods = false): Promise<AgentStats[]> {
    return this.request<AgentStats[]>(
      `/system/agents-stats?includeNonCodepods=${includeNonCodepods}`,
    );
  }

  getNonCodepodsContainers(): Promise<ContainerInfo[]> {
    return this.request<ContainerInfo[]>('/system/non-codepods-containers');
  }

  getCleanupCheck(): Promise<CleanupCheckResult> {
    return this.request<CleanupCheckResult>('/system/cleanup-check');
  }

  removeDockerImage(ref: string): Promise<void> {
    const encoded = encodeURIComponent(ref);
    return this.request<void>(`/system/docker-image?ref=${encoded}`, {
      method: 'DELETE',
    });
  }

  removeOrphanedHome(agentId: string): Promise<void> {
    const encoded = encodeURIComponent(agentId);
    return this.request<void>(`/system/orphaned-home?agentId=${encoded}`, {
      method: 'DELETE',
    });
  }
}