import { authHeaders, notifyUnauthorized } from './auth';
import type { McpServer, McpTransport, McpServerTools } from '@codepods/shared-types';

export interface CreateMcpServerDto {
  name: string;
  slug?: string;
  transport?: McpTransport;
  url?: string | null;
  credentialId?: number | null;
  enabled?: boolean;
  connectAllAgents?: boolean;
}

export interface UpdateMcpServerDto {
  name?: string;
  slug?: string;
  transport?: McpTransport;
  url?: string | null;
  credentialId?: number | null;
  enabled?: boolean;
  connectAllAgents?: boolean;
}

export class McpServersClient {
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

  list(): Promise<McpServer[]> {
    return this.request<McpServer[]>('/mcp-servers');
  }

  get(id: number): Promise<McpServer> {
    return this.request<McpServer>(`/mcp-servers/${id}`);
  }

  create(dto: CreateMcpServerDto): Promise<McpServer> {
    return this.request<McpServer>('/mcp-servers', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  update(id: number, dto: UpdateMcpServerDto): Promise<McpServer> {
    return this.request<McpServer>(`/mcp-servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  remove(id: number): Promise<void> {
    return this.request<void>(`/mcp-servers/${id}`, { method: 'DELETE' });
  }

  reorder(ids: number[]): Promise<void> {
    return this.request<void>('/mcp-servers/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  listTools(id: number): Promise<McpServerTools> {
    return this.request<McpServerTools>(`/mcp-servers/${id}/tools`);
  }

  syncTools(id: number): Promise<McpServerTools> {
    return this.request<McpServerTools>(`/mcp-servers/${id}/tools/sync`, { method: 'POST' });
  }
}