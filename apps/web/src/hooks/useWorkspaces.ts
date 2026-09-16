import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkspacesClient } from '@codepods/sdk';
import type {
  Workspace,
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceRepoInfo,
  WorkspaceFileEntry,
  UploadOverwriteMode,
  GitStatus,
  GitBranchesResult,
} from '@codepods/shared-types';

export const workspacesClient = new WorkspacesClient('/api');
const client = workspacesClient;

const WS_QK = ['workspaces'] as const;

// --- Workspaces ---
export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: WS_QK,
    queryFn: () => client.listWorkspaces(),
    refetchInterval: 15_000,
  });
}

export function useWorkspace(id: number | null) {
  return useQuery<Workspace>({
    queryKey: ['workspaces', id],
    queryFn: () => client.getWorkspace(id!),
    enabled: id !== null,
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateWorkspaceDto) => client.createWorkspace(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: WS_QK }),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateWorkspaceDto }) =>
      client.updateWorkspace(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: WS_QK }),
  });
}

export function useRemoveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.removeWorkspace(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: WS_QK }),
  });
}

export function useWorkspaceInfo(id: number | null) {
  return useQuery<WorkspaceRepoInfo>({
    queryKey: ['workspaces', id, 'info'],
    queryFn: () => client.getWorkspaceInfo(id!),
    enabled: id !== null,
  });
}

export function useTestWorkspace() {
  return useMutation({
    mutationFn: (id: number) => client.testWorkspace(id),
  });
}

export function useCopyAgentsMd() {
  return useMutation({
    mutationFn: ({ id, agentsMdId }: { id: number; agentsMdId?: number | null }) =>
      client.copyAgentsMd(id, agentsMdId),
  });
}

export function useUploadWorkspaceFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, files, subPath, overwrite }: { id: number; files: File[]; subPath?: string; overwrite?: UploadOverwriteMode }) =>
      client.uploadFiles(id, files, subPath ?? '', overwrite ?? 'backup'),
    // File list is keyed ['workspaces', id, 'files', relPath] — prefix
    // invalidation refreshes it after uploads (including drag & drop).
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}
export function useReorderWorkspaces() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => client.reorderWorkspaces(ids),
    onMutate: async (ids: number[]) => {
      await qc.cancelQueries({ queryKey: ['workspaces'] });
      const previous = qc.getQueryData<Workspace[]>(['workspaces']);
      if (previous) {
        qc.setQueryData<Workspace[]>(['workspaces'], previous.map((w) => {
          const pos = ids.indexOf(w.id);
          return { ...w, sortOrder: pos === -1 ? 0 : pos + 1 };
        }));
      }
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) qc.setQueryData(['workspaces'], context.previous);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

// --- File management ---

export function useWorkspaceFiles(id: number | null, relPath = '') {
  return useQuery<WorkspaceFileEntry[]>({
    queryKey: ['workspaces', id, 'files', relPath],
    queryFn: () => client.listFiles(id!, relPath),
    enabled: id !== null,
  });
}

export function useDeleteWorkspaceFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, path }: { id: number; path: string }) => client.deleteFile(id, path),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useCreateWorkspaceFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, path }: { id: number; path: string }) => client.createFolder(id, path),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

// --- Git management ---

export function useGitStatus(id: number | null) {
  return useQuery<GitStatus>({
    queryKey: ['workspaces', id, 'git-status'],
    queryFn: () => client.gitStatus(id!),
    enabled: id !== null,
    refetchInterval: 10_000,
  });
}

export function useGitBranches(id: number | null) {
  return useQuery<GitBranchesResult>({
    queryKey: ['workspaces', id, 'git-branches'],
    queryFn: () => client.gitBranches(id!),
    enabled: id !== null,
  });
}

export function useGitFetch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.gitFetch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useGitStash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'push' | 'pop' }) => client.gitStash(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useGitCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message }: { id: number; message: string }) => client.gitCommit(id, message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export function useGitSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.gitSync(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}
