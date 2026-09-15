import { authHeaders, notifyUnauthorized } from './auth';
import type { DiscoveredTemplate, DiscoveredProvider } from '@codepods/shared-types';

export class CentralReposClient {
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
    return JSON.parse(await res.text()) as T;
  }

  discoverTemplates(): Promise<DiscoveredTemplate[]> {
    return this.request<DiscoveredTemplate[]>('/central-repos/templates');
  }

  discoverProviders(): Promise<DiscoveredProvider[]> {
    return this.request<DiscoveredProvider[]>('/central-repos/providers');
  }
}
