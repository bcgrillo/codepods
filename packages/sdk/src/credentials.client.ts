import { authHeaders, notifyUnauthorized } from './auth';
import type { Credential, CredentialType } from '@codepods/shared-types';

export interface CreateCredentialDto {
  label: string;
  type: CredentialType;
  host?: string | null;
  username?: string | null;
  secret?: string | null;
}

export interface UpdateCredentialDto {
  label?: string;
  type?: CredentialType;
  host?: string | null;
  username?: string | null;
  /** Omit to preserve; empty string to clear. */
  secret?: string | null;
}

export class CredentialsClient {
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

  list(): Promise<Credential[]> {
    return this.request<Credential[]>('/credentials');
  }

  get(id: number): Promise<Credential> {
    return this.request<Credential>(`/credentials/${id}`);
  }

  create(dto: CreateCredentialDto): Promise<Credential> {
    return this.request<Credential>('/credentials', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  update(id: number, dto: UpdateCredentialDto): Promise<Credential> {
    return this.request<Credential>(`/credentials/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  remove(id: number): Promise<void> {
    return this.request<void>(`/credentials/${id}`, { method: 'DELETE' });
  }
}