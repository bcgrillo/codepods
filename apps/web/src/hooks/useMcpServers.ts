import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { McpServersClient } from '@codepods/sdk';
import type { McpServer, McpServerTools } from '@codepods/shared-types';
import type { CreateMcpServerDto, UpdateMcpServerDto } from '@codepods/sdk';

export const mcpServersClient = new McpServersClient('/api');
const client = mcpServersClient;

const QK = ['mcp-servers'] as const;

export function useMcpServers() {
  return useQuery<McpServer[]>({
    queryKey: QK,
    queryFn: () => client.list(),
    refetchInterval: 15_000,
  });
}

export function useMcpServer(id: number | null) {
  return useQuery<McpServer>({
    queryKey: [...QK, id],
    queryFn: () => client.get(id!),
    enabled: id !== null,
  });
}

export function useCreateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateMcpServerDto) => client.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateMcpServerDto }) =>
      client.update(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useRemoveMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useReorderMcpServers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => client.reorder(ids),
    onMutate: async (ids: number[]) => {
      await qc.cancelQueries({ queryKey: [...QK] });
      const previous = qc.getQueryData<McpServer[]>([...QK]);
      if (previous) {
        qc.setQueryData<McpServer[]>([...QK], previous.map((s) => {
          const pos = ids.indexOf(s.id);
          return { ...s, sortOrder: pos === -1 ? 0 : pos + 1 };
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

export function useMcpServerTools(serverId: number | null) {
  return useQuery<McpServerTools>({
    queryKey: [...QK, serverId, 'tools'],
    queryFn: () => client.listTools(serverId!),
    enabled: serverId !== null,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useSyncMcpServerTools() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serverId: number) => client.syncTools(serverId),
    onSuccess: (data) => {
      qc.setQueryData([...QK, data.serverId, 'tools'], data);
    },
  });
}