import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAgents, useAgent, useSetupStatus, useRemoveAgent } from './useAgents';

const { listAgents, getAgent, getSetupStatus, removeAgent } = vi.hoisted(() => ({
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  getSetupStatus: vi.fn(),
  removeAgent: vi.fn(),
}));

vi.mock('@codepods/sdk', () => ({
  AgentsClient: vi.fn().mockImplementation(() => ({
    listAgents,
    getAgent,
    getSetupStatus,
    removeAgent,
  })),
}));

const makeWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the agent list', async () => {
    listAgents.mockResolvedValue([{ id: 'a1', name: 'agent-1' }]);
    const { result } = renderHook(() => useAgents(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listAgents).toHaveBeenCalled();
    expect(result.current.data).toEqual([{ id: 'a1', name: 'agent-1' }]);
  });

  it('useAgent is disabled when id is null', () => {
    const { result } = renderHook(() => useAgent(null), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(true);
    expect(getAgent).not.toHaveBeenCalled();
  });

  it('useAgent fetches a single agent when id is provided', async () => {
    getAgent.mockResolvedValue({ id: 'a1', name: 'agent-1' });
    const { result } = renderHook(() => useAgent('a1'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAgent).toHaveBeenCalledWith('a1');
    expect(result.current.data?.name).toBe('agent-1');
  });

  it('useSetupStatus fetches setup status', async () => {
    getSetupStatus.mockResolvedValue({ ready: true, checks: [] });
    const { result } = renderHook(() => useSetupStatus(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.ready).toBe(true);
  });

  it('removeAgent drops the card from the list cache before the request resolves', async () => {
    const agent = { id: 'a1', name: 'agent-1' };
    listAgents.mockResolvedValue([agent]);
    // Hold the DELETE promise open so we can observe the optimistic state.
    let release!: () => void;
    removeAgent.mockImplementation(
      () => new Promise<void>((res) => (release = res)),
    );

    // Both hooks share ONE QueryClient so the optimistic cache update is visible.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useAgents(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    const remove = renderHook(() => useRemoveAgent(), { wrapper });
    const pending = remove.result.current.mutateAsync({ id: 'a1', deleteWorkspace: false });

    // Optimistically the agent is already gone from the cache (onMutate runs
    // before the mutation resolves).
    await waitFor(() => expect(result.current.data).toEqual([]));

    release();
    await pending;
    expect(removeAgent).toHaveBeenCalledWith('a1', false);
    // After settling, the card stays gone.
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it('removeAgent rolls the card back when the DELETE fails', async () => {
    const agent = { id: 'a1', name: 'agent-1' };
    listAgents.mockResolvedValue([agent]);
    removeAgent.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useAgents(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    const remove = renderHook(() => useRemoveAgent(), { wrapper: makeWrapper() });
    await expect(
      remove.result.current.mutateAsync({ id: 'a1', deleteWorkspace: false }),
    ).rejects.toThrow('boom');

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(removeAgent).toHaveBeenCalledWith('a1', false);
  });
});
