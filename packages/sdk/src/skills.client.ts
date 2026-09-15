import { authHeaders, notifyUnauthorized } from './auth';
import type { Skill, SkillSource, SkillSourceType } from '@codepods/shared-types';

export interface CreateSkillSourceDto {
  name: string;
  type: SkillSourceType;
  gitUrl?: string;
  subPath?: string;
  branch?: string;
  enabled?: boolean;
}

export interface UpdateSkillSourceDto {
  name?: string;
  gitUrl?: string;
  subPath?: string;
  branch?: string;
  enabled?: boolean;
}

export class SkillsClient {
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

  // ---- sources ----
  listSources(): Promise<SkillSource[]> {
    return this.request<SkillSource[]>('/skill-sources');
  }

  getSource(id: number): Promise<SkillSource> {
    return this.request<SkillSource>(`/skill-sources/${id}`);
  }

  createSource(dto: CreateSkillSourceDto): Promise<SkillSource> {
    return this.request<SkillSource>('/skill-sources', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  updateSource(id: number, dto: UpdateSkillSourceDto): Promise<SkillSource> {
    return this.request<SkillSource>(`/skill-sources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  removeSource(id: number): Promise<void> {
    return this.request<void>(`/skill-sources/${id}`, { method: 'DELETE' });
  }

  reorderSources(ids: number[]): Promise<void> {
    return this.request<void>('/skill-sources/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  syncSource(id: number): Promise<SkillSource> {
    return this.request<SkillSource>(`/skill-sources/${id}/sync`, { method: 'POST' });
  }

  listSkillsBySource(sourceId: number): Promise<Skill[]> {
    return this.request<Skill[]>(`/skill-sources/${sourceId}/skills`);
  }

  // ---- local skills ----
  listLocalSkills(): Promise<Skill[]> {
    return this.request<Skill[]>('/skills/local');
  }

  uploadLocalSkill(name: string, file: File): Promise<Skill> {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    return fetch(`${this.baseUrl}/skills/local/upload`, {
      method: 'POST',
      headers: { ...authHeaders() },
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        if (res.status === 401) notifyUnauthorized();
        const text = await res.text();
        throw new Error(`API ${res.status}: ${text}`);
      }
      return res.json() as Promise<Skill>;
    });
  }

  // ---- generic skills ----

  listAllSkills(): Promise<Skill[]> {
    return this.request<Skill[]>('/skills');
  }

  getSkill(id: number): Promise<Skill> {
    return this.request<Skill>(`/skills/${id}`);
  }

  renameSkill(id: number, name: string): Promise<Skill> {
    return this.request<Skill>(`/skills/${id}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  deleteSkill(id: number): Promise<void> {
    return this.request<void>(`/skills/${id}`, { method: 'DELETE' });
  }
}