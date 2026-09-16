import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useWorkspaces,
  useWorkspace,
  useCreateWorkspace,
  useUpdateWorkspace,
  useRemoveWorkspace,
  useWorkspaceInfo,
  useTestWorkspace,
  useCopyAgentsMd,
  useUploadWorkspaceFiles,
} from './useWorkspaces';

const sdk = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  getWorkspace: vi.fn(),
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
  getWorkspaceInfo: vi.fn(),
  testWorkspace: vi.fn(),
  copyAgentsMd: vi.fn(),
  uploadFiles: vi.fn(),
}));

vi.mock('@codepods/sdk', () => ({
  WorkspacesClient: vi.fn().mockImplementation(() => sdk),
}));

const makeWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useWorkspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the workspace list', async () => {
    sdk.listWorkspaces.mockResolvedValue([{ id: 1 }]);
    const { result } = renderHook(() => useWorkspaces(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1 }]);
  });

  it('useWorkspace is disabled when id is null', () => {
    renderHook(() => useWorkspace(null), { wrapper: makeWrapper() });
    expect(sdk.getWorkspace).not.toHaveBeenCalled();
  });

  it('useWorkspace fetches a single workspace', async () => {
    sdk.getWorkspace.mockResolvedValue({ id: 2 });
    const { result } = renderHook(() => useWorkspace(2), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sdk.getWorkspace).toHaveBeenCalledWith(2);
  });

  it('useWorkspaceInfo is disabled when id is null', () => {
    renderHook(() => useWorkspaceInfo(null), { wrapper: makeWrapper() });
    expect(sdk.getWorkspaceInfo).not.toHaveBeenCalled();
  });

  it('useWorkspaceInfo fetches repo info', async () => {
    sdk.getWorkspaceInfo.mockResolvedValue({});
    const { result } = renderHook(() => useWorkspaceInfo(3), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sdk.getWorkspaceInfo).toHaveBeenCalledWith(3);
  });

  it('createWorkspace mutation calls the SDK', async () => {
    sdk.createWorkspace.mockResolvedValue({ id: 1 });
    const { result } = renderHook(() => useCreateWorkspace(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ name: 'ws' } as never);
    expect(sdk.createWorkspace).toHaveBeenCalledWith({ name: 'ws' });
  });

  it('updateWorkspace mutation calls the SDK', async () => {
    sdk.updateWorkspace.mockResolvedValue({ id: 1 });
    const { result } = renderHook(() => useUpdateWorkspace(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 1, dto: { name: 'new' } } as never);
    expect(sdk.updateWorkspace).toHaveBeenCalledWith(1, { name: 'new' });
  });

  it('removeWorkspace mutation calls the SDK', async () => {
    sdk.removeWorkspace.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRemoveWorkspace(), { wrapper: makeWrapper() });
    await result.current.mutateAsync(1);
    expect(sdk.removeWorkspace).toHaveBeenCalledWith(1);
  });

  it('testWorkspace mutation calls the SDK', async () => {
    sdk.testWorkspace.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useTestWorkspace(), { wrapper: makeWrapper() });
    await result.current.mutateAsync(1);
    expect(sdk.testWorkspace).toHaveBeenCalledWith(1);
  });

  it('copyAgentsMd mutation calls the SDK with optional agentsMdId', async () => {
    sdk.copyAgentsMd.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCopyAgentsMd(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 1, agentsMdId: null });
    expect(sdk.copyAgentsMd).toHaveBeenCalledWith(1, null);
  });

  it('uploadFiles mutation calls the SDK with the file list', async () => {
    sdk.uploadFiles.mockResolvedValue({ ok: true, written: ['a.txt'] });
    const files = [new File(['x'], 'a.txt')];
    const { result } = renderHook(() => useUploadWorkspaceFiles(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 1, files });
    expect(sdk.uploadFiles).toHaveBeenCalledWith(1, files, '', 'backup');
  });

  it('uploadFiles mutation forwards the subPath', async () => {
    sdk.uploadFiles.mockResolvedValue({ ok: true, written: ['imagenes/a.png'] });
    const files = [new File(['x'], 'a.png')];
    const { result } = renderHook(() => useUploadWorkspaceFiles(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 1, files, subPath: '/imagenes' });
    expect(sdk.uploadFiles).toHaveBeenCalledWith(1, files, '/imagenes', 'backup');
  });
});
