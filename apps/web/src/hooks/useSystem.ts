import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SystemClient } from '@codepods/sdk';

export const systemClient = new SystemClient('/api');

export function useSystemStats() {
  return useQuery({
    queryKey: ['system-stats'],
    queryFn: () => systemClient.getSystemStats(),
    refetchInterval: 5_000,
  });
}

export function useAgentStats(includeNonCodepods = false) {
  return useQuery({
    queryKey: ['agent-stats', includeNonCodepods],
    queryFn: () => systemClient.getAgentStats(includeNonCodepods),
    refetchInterval: 5_000,
  });
}

export function useNonCodepodsContainers() {
  return useQuery({
    queryKey: ['non-codepods-containers'],
    queryFn: () => systemClient.getNonCodepodsContainers(),
    refetchInterval: 10_000,
  });
}

export function useCleanupCheck() {
  return useQuery({
    queryKey: ['cleanup-check'],
    queryFn: () => systemClient.getCleanupCheck(),
    staleTime: 30_000,
  });
}

export function useRemoveDockerImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) => systemClient.removeDockerImage(ref),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cleanup-check'] }),
  });
}

export function useRemoveOrphanedHome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => systemClient.removeOrphanedHome(agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cleanup-check'] }),
  });
}