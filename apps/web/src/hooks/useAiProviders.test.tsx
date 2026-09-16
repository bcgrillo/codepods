import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useAiProviders,
  useAiProvider,
  useCreateAiProvider,
  useUpdateAiProvider,
  useRemoveAiProvider,
  useTestAiProvider,
  useAiModels,
  useCreateAiModel,
  useUpdateAiModel,
  useRemoveAiModel,
} from './useAiProviders';

const sdk = vi.hoisted(() => ({
  listProviders: vi.fn(),
  getProvider: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  removeProvider: vi.fn(),
  testProvider: vi.fn(),
  listModels: vi.fn(),
  createModel: vi.fn(),
  updateModel: vi.fn(),
  removeModel: vi.fn(),
}));

vi.mock('@codepods/sdk', () => ({
  AiProvidersClient: vi.fn().mockImplementation(() => sdk),
}));

const makeWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

const provider = { id: 1, name: 'openai', baseUrl: 'https://api.openai.com', models: [] };

describe('useAiProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the provider list', async () => {
    sdk.listProviders.mockResolvedValue([provider]);
    const { result } = renderHook(() => useAiProviders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([provider]);
  });

  it('useAiProvider is disabled when id is null', () => {
    renderHook(() => useAiProvider(null), { wrapper: makeWrapper() });
    expect(sdk.getProvider).not.toHaveBeenCalled();
  });

  it('useAiProvider fetches a single provider', async () => {
    sdk.getProvider.mockResolvedValue(provider);
    const { result } = renderHook(() => useAiProvider(1), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sdk.getProvider).toHaveBeenCalledWith(1);
    expect(result.current.data?.name).toBe('openai');
  });

  it('useAiModels fetches models for a provider', async () => {
    sdk.listModels.mockResolvedValue([]);
    const { result } = renderHook(() => useAiModels(1), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sdk.listModels).toHaveBeenCalledWith(1);
  });

  it('createProvider mutation calls the SDK and invalidates', async () => {
    sdk.createProvider.mockResolvedValue(provider);
    const { result } = renderHook(() => useCreateAiProvider(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ name: 'x' } as never);
    expect(sdk.createProvider).toHaveBeenCalledWith({ name: 'x' });
  });

  it('updateProvider mutation calls the SDK', async () => {
    sdk.updateProvider.mockResolvedValue(provider);
    const { result } = renderHook(() => useUpdateAiProvider(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 1, dto: { name: 'y' } } as never);
    expect(sdk.updateProvider).toHaveBeenCalledWith(1, { name: 'y' });
  });

  it('removeProvider mutation calls the SDK', async () => {
    sdk.removeProvider.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRemoveAiProvider(), { wrapper: makeWrapper() });
    await result.current.mutateAsync(1);
    expect(sdk.removeProvider).toHaveBeenCalledWith(1);
  });

  it('testProvider mutation calls the SDK with optional modelId', async () => {
    sdk.testProvider.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useTestAiProvider(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 1, modelId: 5 });
    expect(sdk.testProvider).toHaveBeenCalledWith(1, 5);
  });

  it('createModel mutation calls the SDK', async () => {
    sdk.createModel.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCreateAiModel(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ providerId: 1, dto: {} } as never);
    expect(sdk.createModel).toHaveBeenCalledWith(1, {});
  });

  it('updateModel mutation applies optimistic update and rolls back on error', async () => {
    sdk.updateModel.mockResolvedValue(undefined);
    const { result } = renderHook(() => useUpdateAiModel(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ providerId: 1, modelId: 2, dto: { name: 'm2' } } as never);
    expect(sdk.updateModel).toHaveBeenCalledWith(1, 2, { name: 'm2' });
  });

  it('removeModel mutation calls the SDK', async () => {
    sdk.removeModel.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRemoveAiModel(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ providerId: 1, modelId: 2 });
    expect(sdk.removeModel).toHaveBeenCalledWith(1, 2);
  });
});
