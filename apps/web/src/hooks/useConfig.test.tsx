import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useConfig, useAgentsMdList } from './useConfig';

const { getConfig, listAgentsMd } = vi.hoisted(() => ({
  getConfig: vi.fn(),
  listAgentsMd: vi.fn(),
}));

vi.mock('@codepods/sdk', () => ({
  ConfigClient: vi.fn().mockImplementation(() => ({
    getConfig,
    listAgentsMd,
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

describe('useConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the config', async () => {
    getConfig.mockResolvedValue({ port: 3000, dataDir: '/tmp/data' });
    const { result } = renderHook(() => useConfig(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getConfig).toHaveBeenCalled();
    expect(result.current.data?.port).toBe(3000);
  });

  it('fetches the AGENTS.md list', async () => {
    listAgentsMd.mockResolvedValue([{ id: 1, alias: 'Default' }]);
    const { result } = renderHook(() => useAgentsMdList(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listAgentsMd).toHaveBeenCalled();
    expect(result.current.data).toHaveLength(1);
  });
});
