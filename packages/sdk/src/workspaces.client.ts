import { authHeaders, notifyUnauthorized } from './auth';
import type {
  Workspace,
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceRepoInfo,
  WorkspaceTestResult,
  WorkspaceFileEntry,
  UploadOverwriteMode,
  UploadResult,
  GitStatus,
  GitBranchesResult,
  GitStashResult,
  GitCommitResult,
  GitSyncResult,
} from '@codepods/shared-types';

export class WorkspacesClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData;
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: isForm ? { ...authHeaders(), ...init?.headers } : { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
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

  // --- Workspaces ---
  listWorkspaces(): Promise<Workspace[]> {
    return this.request<Workspace[]>('/workspaces');
  }
  reorderWorkspaces(ids: number[]): Promise<void> {
    return this.request<void>('/workspaces/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }
  getWorkspace(id: number): Promise<Workspace> {
    return this.request<Workspace>(`/workspaces/${id}`);
  }
  createWorkspace(dto: CreateWorkspaceDto): Promise<Workspace> {
    return this.request<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify(dto) });
  }
  updateWorkspace(id: number, dto: UpdateWorkspaceDto): Promise<Workspace> {
    return this.request<Workspace>(`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }
  removeWorkspace(id: number): Promise<void> {
    return this.request<void>(`/workspaces/${id}`, { method: 'DELETE' });
  }
  getWorkspaceInfo(id: number): Promise<WorkspaceRepoInfo> {
    return this.request<WorkspaceRepoInfo>(`/workspaces/${id}/info`);
  }
  testWorkspace(id: number): Promise<WorkspaceTestResult> {
    return this.request<WorkspaceTestResult>(`/workspaces/${id}/test`, { method: 'POST' });
  }
  copyAgentsMd(id: number, agentsMdId?: number | null): Promise<{ ok: true; renamed: boolean; backupName?: string }> {
    return this.request<{ ok: true; renamed: boolean; backupName?: string }>(`/workspaces/${id}/copy-agents-md`, {
      method: 'POST',
      body: JSON.stringify({ agentsMdId: agentsMdId ?? null }),
    });
  }
  uploadFiles(
    id: number,
    files: File[],
    subPath = '',
    overwrite: UploadOverwriteMode = 'backup',
  ): Promise<UploadResult> {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    if (subPath) form.append('path', subPath);
    form.append('overwrite', overwrite);
    return this.request<UploadResult>(
      `/workspaces/${id}/upload`,
      {
        method: 'POST',
        body: form,
      },
    );
  }

  // --- File management ---

  listFiles(id: number, relPath = ''): Promise<WorkspaceFileEntry[]> {
    const qs = relPath ? `?path=${encodeURIComponent(relPath)}` : '';
    return this.request<WorkspaceFileEntry[]>(`/workspaces/${id}/files${qs}`);
  }

  async readFile(id: number, relPath: string): Promise<{ blob: Blob; filename: string }> {
    const qs = `?path=${encodeURIComponent(relPath)}`;
    const res = await fetch(`${this.baseUrl}/workspaces/${id}/files/content${qs}`, {
      headers: { ...authHeaders() },
    });
    if (!res.ok) {
      if (res.status === 401) notifyUnauthorized();
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
    const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : 'download';
    const blob = await res.blob();
    return { blob, filename };
  }

  deleteFile(id: number, relPath: string): Promise<void> {
    const qs = `?path=${encodeURIComponent(relPath)}`;
    return this.request<void>(`/workspaces/${id}/files${qs}`, { method: 'DELETE' });
  }

  createFolder(id: number, relPath: string): Promise<WorkspaceFileEntry> {
    return this.request<WorkspaceFileEntry>(`/workspaces/${id}/folder`, {
      method: 'POST',
      body: JSON.stringify({ path: relPath }),
    });
  }

  // --- Git management ---

  gitStatus(id: number): Promise<GitStatus> {
    return this.request<GitStatus>(`/workspaces/${id}/git/status`);
  }

  gitBranches(id: number): Promise<GitBranchesResult> {
    return this.request<GitBranchesResult>(`/workspaces/${id}/git/branches`);
  }

  gitFetch(id: number): Promise<{ ok: true; message: string }> {
    return this.request<{ ok: true; message: string }>(`/workspaces/${id}/git/fetch`, { method: 'POST' });
  }

  gitStash(id: number, action: 'push' | 'pop'): Promise<GitStashResult> {
    return this.request<GitStashResult>(`/workspaces/${id}/git/stash`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  gitCommit(id: number, message: string): Promise<GitCommitResult> {
    return this.request<GitCommitResult>(`/workspaces/${id}/git/commit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  gitSync(id: number): Promise<GitSyncResult> {
    return this.request<GitSyncResult>(`/workspaces/${id}/git/sync`, { method: 'POST' });
  }
}