import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useSkillSources,
  useSkillSource,
  useCreateSkillSource,
  useUpdateSkillSource,
  useRemoveSkillSource,
  useSyncSkillSource,
  useSkillsBySource,
  useAllSkills,
  useLocalSkills,
  useUploadLocalSkill,
  useRenameSkill,
  useDeleteSkill,
} from './useSkills';
import type { Skill, SkillSource } from '@codepods/shared-types';

const sdk = vi.hoisted(() => ({
  listSources: vi.fn(),
  getSource: vi.fn(),
  createSource: vi.fn(),
  updateSource: vi.fn(),
  removeSource: vi.fn(),
  syncSource: vi.fn(),
  listSkillsBySource: vi.fn(),
  listAllSkills: vi.fn(),
  listLocalSkills: vi.fn(),
  uploadLocalSkill: vi.fn(),
  renameSkill: vi.fn(),
  deleteSkill: vi.fn(),
}));

vi.mock('@codepods/sdk', () => ({
  SkillsClient: vi.fn().mockImplementation(() => sdk),
}));

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

const source: SkillSource = {
  id: 1,
  codepodId: 1,
  name: 'Local',
  type: 'local',
  gitUrl: null,
  subPath: null,
  branch: null,
  commitSha: null,
  lastSyncedAt: null,
  enabled: true,
  builtIn: true,
  localDir: '/data/skills',
  skillCount: 0,
  sortOrder: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const skill: Skill = {
  id: 10,
  codepodId: 1,
  sourceId: 1,
  sourceType: 'local',
  name: 'my-skill',
  description: 'd',
  path: 'my-skill',
  skillMd: '---\n---\nbody',
  uploaded: true,
  lastSeenAt: '2024-01-01T00:00:00Z',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('useSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useSkillSources fetches the list', async () => {
    sdk.listSources.mockResolvedValue([source]);
    const { result } = renderHook(() => useSkillSources(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([source]);
  });

  it('useSkillSource is disabled when id is null', () => {
    renderHook(() => useSkillSource(null), { wrapper: makeWrapper() });
    expect(sdk.getSource).not.toHaveBeenCalled();
  });

  it('useSkillSource fetches by id', async () => {
    sdk.getSource.mockResolvedValue(source);
    const { result } = renderHook(() => useSkillSource(1), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sdk.getSource).toHaveBeenCalledWith(1);
  });

  it('useCreateSkillSource calls createSource', async () => {
    sdk.createSource.mockResolvedValue(source);
    const { result } = renderHook(() => useCreateSkillSource(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ name: 'R', type: 'repo', gitUrl: 'https://x' } as never);
    expect(sdk.createSource).toHaveBeenCalled();
  });

  it('useUpdateSkillSource calls updateSource with id+dto', async () => {
    sdk.updateSource.mockResolvedValue(source);
    const { result } = renderHook(() => useUpdateSkillSource(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 1, dto: { enabled: false } as never });
    expect(sdk.updateSource).toHaveBeenCalledWith(1, { enabled: false });
  });

  it('useRemoveSkillSource calls removeSource', async () => {
    sdk.removeSource.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRemoveSkillSource(), { wrapper: makeWrapper() });
    await result.current.mutateAsync(1);
    expect(sdk.removeSource).toHaveBeenCalledWith(1);
  });

  it('useSyncSkillSource calls syncSource', async () => {
    sdk.syncSource.mockResolvedValue(source);
    const { result } = renderHook(() => useSyncSkillSource(), { wrapper: makeWrapper() });
    await result.current.mutateAsync(1);
    expect(sdk.syncSource).toHaveBeenCalledWith(1);
  });

  it('useSkillsBySource is disabled when sourceId is null', () => {
    renderHook(() => useSkillsBySource(null), { wrapper: makeWrapper() });
    expect(sdk.listSkillsBySource).not.toHaveBeenCalled();
  });

  it('useSkillsBySource fetches skills for a source', async () => {
    sdk.listSkillsBySource.mockResolvedValue([skill]);
    const { result } = renderHook(() => useSkillsBySource(1), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sdk.listSkillsBySource).toHaveBeenCalledWith(1);
  });

  it('useAllSkills fetches all skills', async () => {
    sdk.listAllSkills.mockResolvedValue([skill]);
    const { result } = renderHook(() => useAllSkills(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sdk.listAllSkills).toHaveBeenCalled();
  });

  it('useLocalSkills fetches local skills', async () => {
    sdk.listLocalSkills.mockResolvedValue([skill]);
    const { result } = renderHook(() => useLocalSkills(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sdk.listLocalSkills).toHaveBeenCalled();
  });

  it('useUploadLocalSkill calls uploadLocalSkill with name+file', async () => {
    sdk.uploadLocalSkill.mockResolvedValue(skill);
    const { result } = renderHook(() => useUploadLocalSkill(), { wrapper: makeWrapper() });
    const file = new File(['x'], 's.md', { type: 'text/markdown' });
    await result.current.mutateAsync({ name: 's', file });
    expect(sdk.uploadLocalSkill).toHaveBeenCalledWith('s', file);
  });

  it('useRenameSkill calls renameSkill with id+name', async () => {
    sdk.renameSkill.mockResolvedValue(skill);
    const { result } = renderHook(() => useRenameSkill(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 10, name: 'new' });
    expect(sdk.renameSkill).toHaveBeenCalledWith(10, 'new');
  });

  it('useDeleteSkill calls deleteSkill', async () => {
    sdk.deleteSkill.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteSkill(), { wrapper: makeWrapper() });
    await result.current.mutateAsync(10);
    expect(sdk.deleteSkill).toHaveBeenCalledWith(10);
  });
});