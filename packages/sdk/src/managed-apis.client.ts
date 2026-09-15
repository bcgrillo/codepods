import { authHeaders, notifyUnauthorized } from './auth';
import type { ManagedApi } from '@codepods/shared-types';

export interface CreateManagedApiDto {
  name: string;
  description?: string;
  baseUrl: string;
  credentialId?: number | null;
  headerPattern: string;
  enabled?: boolean;
}

export interface UpdateManagedApiDto {
  name?: string;
  description?: string;
  baseUrl?: string;
  credentialId?: number | null;
  headerPattern?: string;
  enabled?: boolean;
}

export class ManagedApisClient {
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

  list(): Promise<ManagedApi[]> {
    return this.request<ManagedApi[]>('/managed-apis');
  }

  get(id: number): Promise<ManagedApi> {
    return this.request<ManagedApi>(`/managed-apis/${id}`);
  }

  create(dto: CreateManagedApiDto): Promise<ManagedApi> {
    return this.request<ManagedApi>('/managed-apis', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  update(id: number, dto: UpdateManagedApiDto): Promise<ManagedApi> {
    return this.request<ManagedApi>(`/managed-apis/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  remove(id: number): Promise<void> {
    return this.request<void>(`/managed-apis/${id}`, { method: 'DELETE' });
  }
}