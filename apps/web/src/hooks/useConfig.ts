import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfigClient } from '@codepods/sdk';
import type {
  CodepodsConfigDto,
  CreateAgentsMdDto,
  UpdateAgentsMdDto,
  CreateTempExceptionDto,
} from '@codepods/shared-types';

export const configClient = new ConfigClient('/api');

// --- Config ---

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => configClient.getConfig(),
  });
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<CodepodsConfigDto>) => configClient.updateConfig(values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });
}

export function useReloadConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => configClient.reloadConfig(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });
}

// --- AgentsMd ---

export function useAgentsMdList() {
  return useQuery({
    queryKey: ['agents-md'],
    queryFn: () => configClient.listAgentsMd(),
  });
}

export function useAgentsMd(id: number | null) {
  return useQuery({
    queryKey: ['agents-md', id],
    queryFn: () => configClient.getAgentsMd(id!),
    enabled: id != null,
  });
}

export function useDefaultAgentsMd() {
  return useQuery({
    queryKey: ['agents-md', 'default'],
    queryFn: () => configClient.getDefaultAgentsMd(),
  });
}

export function useCreateAgentsMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAgentsMdDto) => configClient.createAgentsMd(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents-md'] }),
  });
}

export function useUpdateAgentsMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateAgentsMdDto }) =>
      configClient.updateAgentsMd(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents-md'] }),
  });
}

export function useSetDefaultAgentsMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => configClient.setDefaultAgentsMd(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents-md'] }),
  });
}

export function useRemoveAgentsMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => configClient.removeAgentsMd(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents-md'] }),
  });
}

// --- Egress temp exceptions ---

export function useTempExceptions() {
  return useQuery({
    queryKey: ['egress', 'temp-exceptions'],
    queryFn: () => configClient.listTempExceptions(),
    refetchInterval: 10_000,
  });
}

export function useCreateTempException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTempExceptionDto) => configClient.createTempException(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['egress', 'temp-exceptions'] }),
  });
}

export function useRevokeTempException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (host: string) => configClient.revokeTempException(host),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['egress', 'temp-exceptions'] }),
  });
}