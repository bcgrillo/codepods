import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CredentialsClient } from '@codepods/sdk';
import type {
  CreateCredentialDto,
  UpdateCredentialDto,
} from '@codepods/sdk';
import type { Credential } from '@codepods/shared-types';

export const credentialsClient = new CredentialsClient('/api');
const client = credentialsClient;

const QK = ['credentials'] as const;

export function useCredentials() {
  return useQuery<Credential[]>({
    queryKey: QK,
    queryFn: () => client.list(),
  });
}

export function useCredential(id: number | null) {
  return useQuery<Credential>({
    queryKey: [...QK, id],
    queryFn: () => client.get(id!),
    enabled: id !== null,
  });
}

export function useCreateCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCredentialDto) => client.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateCredentialDto }) =>
      client.update(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useRemoveCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}