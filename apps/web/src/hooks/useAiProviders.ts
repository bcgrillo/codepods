import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AiProvidersClient } from '@codepods/sdk';
import type {
  AiProvider,
  CreateAiProviderDto,
  UpdateAiProviderDto,
  CreateAiModelDto,
  UpdateAiModelDto,
  AiProviderTestResult,
} from '@codepods/shared-types';

export const aiProvidersClient = new AiProvidersClient('/api');
const client = aiProvidersClient;

const QK = ['ai-providers'] as const;

export function useAiProviders() {
  return useQuery<AiProvider[]>({
    queryKey: QK,
    queryFn: () => client.listProviders(),
    refetchInterval: 15_000,
  });
}

export function useAiProvider(id: number | null) {
  return useQuery<AiProvider>({
    queryKey: [...QK, id],
    queryFn: () => client.getProvider(id!),
    enabled: id !== null,
  });
}

export function useCreateAiProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAiProviderDto) => client.createProvider(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateAiProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateAiProviderDto }) =>
      client.updateProvider(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useRemoveAiProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.removeProvider(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useTestAiProvider() {
  return useMutation({
    mutationFn: ({ id, modelId }: { id: number; modelId?: number }) =>
      client.testProvider(id, modelId),
  });
}

export function useAiModels(providerId: number | null) {
  return useQuery({
    queryKey: [...QK, providerId, 'models'],
    queryFn: () => client.listModels(providerId!),
    enabled: providerId !== null,
  });
}

export function useCreateAiModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, dto }: { providerId: number; dto: CreateAiModelDto }) =>
      client.createModel(providerId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateAiModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      providerId,
      modelId,
      dto,
    }: {
      providerId: number;
      modelId: number;
      dto: UpdateAiModelDto;
    }) => client.updateModel(providerId, modelId, dto),
    onMutate: async ({ providerId, modelId, dto }) => {
      const key = [...QK, providerId] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AiProvider>(key);
      if (prev) {
        qc.setQueryData<AiProvider>(key, {
          ...prev,
          models: prev.models.map((m) =>
            m.id === modelId ? { ...m, ...dto } : dto.isDefault ? { ...m, isDefault: false } : m,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, { providerId }, ctx) => {
      if (ctx?.prev) qc.setQueryData([...QK, providerId], ctx.prev);
    },
    onSuccess: (_data, { providerId }) => {
      qc.invalidateQueries({ queryKey: [...QK, providerId] });
    },
  });
}

export function useRemoveAiModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, modelId }: { providerId: number; modelId: number }) =>
      client.removeModel(providerId, modelId),
    onMutate: async ({ providerId, modelId }) => {
      const key = [...QK, providerId] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AiProvider>(key);
      if (prev) {
        qc.setQueryData<AiProvider>(key, {
          ...prev,
          models: prev.models.filter((m) => m.id !== modelId),
        });
      }
      return { prev };
    },
    onError: (_err, { providerId }, ctx) => {
      if (ctx?.prev) qc.setQueryData([...QK, providerId], ctx.prev);
    },
    onSuccess: (_data, { providerId }) => {
      qc.invalidateQueries({ queryKey: [...QK, providerId] });
    },
  });
}

export type { AiProviderTestResult };
export function useReorderAiProviders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => client.reorderProviders(ids),
    onMutate: async (ids: number[]) => {
      await qc.cancelQueries({ queryKey: [...QK] });
      const previous = qc.getQueryData<AiProvider[]>([...QK]);
      if (previous) {
        qc.setQueryData<AiProvider[]>([...QK], previous.map((p) => {
          const pos = ids.indexOf(p.id);
          return { ...p, sortOrder: pos === -1 ? 0 : pos + 1 };
        }));
      }
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) qc.setQueryData([...QK], context.previous);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...QK] }),
  });
}
