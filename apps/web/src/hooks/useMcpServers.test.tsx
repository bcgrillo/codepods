import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useMcpServers,
  useMcpServer,
  useCreateMcpServer,
  useUpdateMcpServer,
  useRemoveMcpServer,
  useMcpServerTools,
  useSyncMcpServerTools,
} from './useMcpServers';
import type { McpServer, McpServerTools } from '@codepods/shared-types';

const sdk = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  listTools: vi.fn(),
  syncTools: vi.fn(),
}));

vi.mock('@codepods/sdk', () => ({
  McpServersClient: vi.fn().mockImplementation(() => sdk),
}));

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

const mcp: McpServer = {
  id: 1,
  codepodId: 1,
  name: 'GitHub',
  slug: 'github',
  transport: 'http',
  url: 'https://mcp.github.com/mcp',
  credentialId: null,
  enabled: true,
  builtIn: false,
  connectAllAgents: false,
  sortOrder: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const tools: McpServerTools = {
  serverId: 1,
  slug: 'github',
  builtIn: false,
  tools: [{ name: 'create_issue', description: 'd' }],
  reachable: true,
};

describe('useMcpServers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useMcpServers fetches the list', async () => {
    sdk.list.mockResolvedValue([mcp]);
    const { result } = renderHook(() => useMcpServers(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mcp]);
  });

  it('useMcpServer is disabled when id is null', () => {
    renderHook(() => useMcpServer(null), { wrapper: makeWrapper() });
    expect(sdk.get).not.toHaveBeenCalled();
  });

  it('useMcpServer fetches by id', async () => {
    sdk.get.mockResolvedValue(mcp);
    const { result } = renderHook(() => useMcpServer(1), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sdk.get).toHaveBeenCalledWith(1);
  });

  it('useCreateMcpServer invalidates the list on success', async () => {
    sdk.create.mockResolvedValue(mcp);
    const { result } = renderHook(() => useCreateMcpServer(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ name: 'GitHub', slug: 'github', transport: 'http', url: 'https://x' } as never);
    expect(sdk.create).toHaveBeenCalled();
  });

  it('useUpdateMcpServer calls update with id+dto', async () => {
    sdk.update.mockResolvedValue(mcp);
    const { result } = renderHook(() => useUpdateMcpServer(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 1, dto: { enabled: false } as never });
    expect(sdk.update).toHaveBeenCalledWith(1, { enabled: false });
  });

  it('useRemoveMcpServer calls remove', async () => {
    sdk.remove.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRemoveMcpServer(), { wrapper: makeWrapper() });
    await result.current.mutateAsync(1);
    expect(sdk.remove).toHaveBeenCalledWith(1);
  });

  describe('useMcpServerTools', () => {
    it('is disabled when serverId is null', () => {
      renderHook(() => useMcpServerTools(null), { wrapper: makeWrapper() });
      expect(sdk.listTools).not.toHaveBeenCalled();
    });

    it('fetches tools when serverId is provided', async () => {
      sdk.listTools.mockResolvedValue(tools);
      const { result } = renderHook(() => useMcpServerTools(1), { wrapper: makeWrapper() });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(sdk.listTools).toHaveBeenCalledWith(1);
      expect(result.current.data).toEqual(tools);
    });
  });

  describe('useSyncMcpServerTools', () => {
    it('calls syncTools and populates the query cache', async () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );
      sdk.syncTools.mockResolvedValue(tools);
      const { result } = renderHook(() => useSyncMcpServerTools(), { wrapper });
      await result.current.mutateAsync(1);
      expect(sdk.syncTools).toHaveBeenCalledWith(1);
      await waitFor(() =>
        expect(qc.getQueryData(['mcp-servers', 1, 'tools'])).toEqual(tools),
      );
    });
  });
});