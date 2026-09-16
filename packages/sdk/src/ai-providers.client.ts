import { authHeaders, notifyUnauthorized } from './auth';
import type {
  AiProvider,
  AiModel,
  CreateAiProviderDto,
  UpdateAiProviderDto,
  CreateAiModelDto,
  UpdateAiModelDto,
  AiProviderTestResult,
} from '@codepods/shared-types';

export class AiProvidersClient {
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

  listProviders(): Promise<AiProvider[]> {
    return this.request<AiProvider[]>('/ai-providers');
  }

  reorderProviders(ids: number[]): Promise<void> {
    return this.request<void>('/ai-providers/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  getProvider(id: number): Promise<AiProvider> {
    return this.request<AiProvider>(`/ai-providers/${id}`);
  }

  createProvider(dto: CreateAiProviderDto): Promise<AiProvider> {
    return this.request<AiProvider>('/ai-providers', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  updateProvider(id: number, dto: UpdateAiProviderDto): Promise<AiProvider> {
    return this.request<AiProvider>(`/ai-providers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  removeProvider(id: number): Promise<void> {
    return this.request<void>(`/ai-providers/${id}`, { method: 'DELETE' });
  }

  testProvider(id: number, modelId?: number): Promise<AiProviderTestResult[]> {
    const qs = modelId ? `?modelId=${modelId}` : '';
    return this.request<AiProviderTestResult[]>(`/ai-providers/${id}/test${qs}`, { method: 'POST' });
  }

  listModels(providerId: number): Promise<AiModel[]> {
    return this.request<AiModel[]>(`/ai-providers/${providerId}/models`);
  }

  createModel(providerId: number, dto: CreateAiModelDto): Promise<AiModel> {
    return this.request<AiModel>(`/ai-providers/${providerId}/models`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  updateModel(providerId: number, modelId: number, dto: UpdateAiModelDto): Promise<AiModel> {
    return this.request<AiModel>(`/ai-providers/${providerId}/models/${modelId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  removeModel(providerId: number, modelId: number): Promise<void> {
    return this.request<void>(`/ai-providers/${providerId}/models/${modelId}`, {
      method: 'DELETE',
    });
  }
}