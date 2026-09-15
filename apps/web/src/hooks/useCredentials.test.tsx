import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCredentials,
  useCredential,
  useCreateCredential,
  useUpdateCredential,
  useRemoveCredential,
} from './useCredentials';
import type { Credential } from '@codepods/shared-types';

const sdk = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@codepods/sdk', () => ({
  CredentialsClient: vi.fn().mockImplementation(() => sdk),
}));

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

const cred: Credential = {
  id: 1,
  codepodId: 1,
  label: 'GitHub PAT',
  type: 'key',
  host: 'github.com',
  username: null,
  hasSecret: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('useCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useCredentials fetches the list', async () => {
    sdk.list.mockResolvedValue([cred]);
    const { result } = renderHook(() => useCredentials(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([cred]);
  });

  it('useCredential is disabled when id is null', () => {
    renderHook(() => useCredential(null), { wrapper: makeWrapper() });
    expect(sdk.get).not.toHaveBeenCalled();
  });

  it('useCredential fetches by id', async () => {
    sdk.get.mockResolvedValue(cred);
    const { result } = renderHook(() => useCredential(1), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sdk.get).toHaveBeenCalledWith(1);
  });

  it('useCreateCredential calls create', async () => {
    sdk.create.mockResolvedValue(cred);
    const { result } = renderHook(() => useCreateCredential(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ label: 'x', type: 'key', host: 'github.com', secret: 's' } as never);
    expect(sdk.create).toHaveBeenCalled();
  });

  it('useUpdateCredential calls update with id+dto', async () => {
    sdk.update.mockResolvedValue(cred);
    const { result } = renderHook(() => useUpdateCredential(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 1, dto: { label: 'y' } as never });
    expect(sdk.update).toHaveBeenCalledWith(1, { label: 'y' });
  });

  it('useRemoveCredential calls remove', async () => {
    sdk.remove.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRemoveCredential(), { wrapper: makeWrapper() });
    await result.current.mutateAsync(1);
    expect(sdk.remove).toHaveBeenCalledWith(1);
  });
});