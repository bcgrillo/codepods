import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ManagedApisClient } from '@codepods/sdk';
import type { ManagedApi } from '@codepods/shared-types';
import type { CreateManagedApiDto, UpdateManagedApiDto } from '@codepods/sdk';

const client = new ManagedApisClient('/api');

const QK = ['managed-apis'] as const;

export function useManagedApis() {
  return useQuery<ManagedApi[]>({
    queryKey: QK,
    queryFn: () => client.list(),
  });
}

export function useManagedApi(id: number | null) {
  return useQuery<ManagedApi>({
    queryKey: [...QK, id],
    queryFn: () => client.get(id!),
    enabled: id !== null,
  });
}

export function useCreateManagedApi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateManagedApiDto) => client.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateManagedApi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateManagedApiDto }) =>
      client.update(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useRemoveManagedApi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}