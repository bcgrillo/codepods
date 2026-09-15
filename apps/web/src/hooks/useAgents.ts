import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AgentsClient } from '@codepods/sdk';
import type {
  Agent,
  AgentService,
  CreateAgentDto,
  CreateAgentServiceDto,
  CreateImageTemplateDto,
  UpdateImageTemplateDto,
  UpdateAgentServiceDto,
  ExecuteAgentCommandDto,
  ExecuteAgentCommandResult,
  ImageTemplate,
} from '@codepods/shared-types';

export const agentsClient = new AgentsClient('/api');
const client = agentsClient;

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => client.listAgents(),
    refetchInterval: 5_000,
  });
}

export function useAgent(id: string | null, refetchMs = 5_000) {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => client.getAgent(id!),
    enabled: !!id,
    refetchInterval: refetchMs,
  });
}

export function useStartAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.startAgent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAgentDto) => client.createAgent(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useStopAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.stopAgent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useRestartAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.restartAgent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useRecreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.recreateAgent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useRenameAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      client.renameAgent(id, name),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agents', variables.id] });
    },
  });
}

export function useUpdateAgentEnvVars() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, envVars }: { id: string; envVars: Record<string, string> }) =>
      client.updateAgentEnvVars(id, { envVars }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agents', variables.id] });
    },
  });
}

export function useExecuteAgentCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ExecuteAgentCommandDto }) =>
      client.executeAgentCommand(id, dto),
    onSuccess: (_data: ExecuteAgentCommandResult, variables) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agents', variables.id] });
    },
  });
}

export function useAgentContainerEnvVars(id: string | null) {
  return useQuery({
    queryKey: ['agents', id, 'container-env'],
    queryFn: () => client.getAgentContainerEnvVars(id!),
    enabled: !!id,
    refetchInterval: 10_000,
  });
}

export function useAgentContainerLogs(id: string | null, enabled = true, tail = 500) {
  return useQuery({
    queryKey: ['agents', id, 'container-logs', tail],
    queryFn: () => client.getAgentContainerLogs(id!, tail),
    enabled: !!id && enabled,
    // Poll while the container-log view is open so live stdout/stderr appears
    // (docker logs is buffered until new output is written).
    refetchInterval: enabled ? 5_000 : false,
  });
}

export function useUpdateAgentCreationLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, creationLog }: { id: string; creationLog: string }) =>
      client.updateAgentCreationLog(id, creationLog),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agents', variables.id] });
    },
  });
}

export function useRemoveAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleteWorkspace }: { id: string; deleteWorkspace?: boolean }) =>
      client.removeAgent(id, deleteWorkspace ?? false),
    onMutate: async ({ id }) => {
      // Optimistically remove the agent from the list cache immediately (before
      // the request resolves) so the sidebar card disappears as soon as the
      // user confirms — no "ghost card" while the DELETE is in flight.
      await qc.cancelQueries({ queryKey: ['agents'] });
      const previous = qc.getQueryData<Agent[]>(['agents']);
      qc.setQueryData<Agent[]>(['agents'], (old) =>
        old?.filter((a) => a.id !== id),
      );
      return { previous };
    },
    onSuccess: (_data, variables) => {
      // Also drop the per-agent detail query so AgentDetail can't keep showing
      // stale settings after the row is gone.
      qc.removeQueries({ queryKey: ['agents', variables.id] });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (_err, variables, ctx) => {
      // Roll back the optimistic removal so the card reappears on failure.
      if (ctx?.previous) {
        qc.setQueryData<Agent[]>(['agents'], ctx.previous);
      }
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agents', variables.id] });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useAgentServices(agentId: string | null) {
  return useQuery<AgentService[]>({
    queryKey: ['agents', agentId, 'services'],
    queryFn: () => client.listAgentServices(agentId!),
    enabled: agentId !== null,
    refetchInterval: 10_000,
  });
}

export function useCreateAgentService(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAgentServiceDto) => client.createAgentService(agentId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents', agentId, 'services'] }),
  });
}

export function useRemoveAgentService(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serviceId: number) => client.removeAgentService(agentId, serviceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents', agentId, 'services'] }),
  });
}

export function useUpdateAgentService(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, dto }: { serviceId: number; dto: UpdateAgentServiceDto }) =>
      client.updateAgentService(agentId, serviceId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents', agentId, 'services'] }),
  });
}

// ---- Per-agent MCP management ----

export function useAgentMcps(agentId: string | null) {
  return useQuery({
    queryKey: ['agents', agentId, 'mcps'],
    queryFn: () => client.listAgentMcps(agentId!),
    enabled: agentId !== null,
  });
}

export function useConnectAgentMcp(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mcpServerId: number) => client.connectAgentMcp(agentId, mcpServerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents', agentId, 'mcps'] });
      qc.invalidateQueries({ queryKey: ['agents', agentId] });
    },
  });
}

export function useDisconnectAgentMcp(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mcpServerId: number) => client.disconnectAgentMcp(agentId, mcpServerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents', agentId, 'mcps'] });
      qc.invalidateQueries({ queryKey: ['agents', agentId] });
    },
  });
}

export function useSyncAgentMcps(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.syncAgentMcps(agentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents', agentId, 'mcps'] });
    },
  });
}

/** Cached per-agent MCP tool inventory (for the agent settings tools panel). */
export function useAgentMcpTools(agentId: string | null) {
  return useQuery({
    queryKey: ['agents', agentId, 'mcp-tools'],
    queryFn: () => client.listAgentMcpTools(agentId!),
    enabled: agentId !== null,
    // The API caches remote tool lists for 60s; keep the client result fresh-ish.
    staleTime: 60_000,
  });
}

// ---- Per-agent Skills management ----

export function useAgentSkills(agentId: string | null) {
  return useQuery({
    queryKey: ['agents', agentId, 'skills'],
    queryFn: () => client.listAgentSkills(agentId!),
    enabled: agentId !== null,
  });
}

export function useConnectAgentSkill(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillId: number) => client.connectAgentSkill(agentId, skillId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents', agentId, 'skills'] });
      qc.invalidateQueries({ queryKey: ['agents', agentId] });
    },
  });
}

export function useDisconnectAgentSkill(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillId: number) => client.disconnectAgentSkill(agentId, skillId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents', agentId, 'skills'] });
      qc.invalidateQueries({ queryKey: ['agents', agentId] });
    },
  });
}

export function useSyncAgentSkills(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.syncAgentSkills(agentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents', agentId, 'skills'] });
    },
  });
}

export function useAgentNotices(agentId: string | null) {
  return useQuery({
    queryKey: ['agents', agentId, 'notices'],
    queryFn: () => client.listAgentNotices(agentId!),
    enabled: !!agentId,
    refetchInterval: 10_000,
  });
}

export function useDismissAgentNotice(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noticeId: number) => client.dismissAgentNotice(agentId, noticeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents', agentId, 'notices'] });
    },
  });
}

export function useAgentRequests(agentId: string | null) {
  return useQuery({
    queryKey: ['agents', agentId, 'requests'],
    queryFn: () => client.listAgentRequests(agentId!),
    enabled: !!agentId,
    refetchInterval: 5_000,
  });
}

export function useApproveAgentRequest(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, durationMinutes }: { requestId: number; durationMinutes?: number }) =>
      client.approveAgentRequest(agentId, requestId, durationMinutes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents', agentId, 'requests'] });
    },
  });
}

export function useRejectAgentRequest(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: number) => client.rejectAgentRequest(agentId, requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents', agentId, 'requests'] });
    },
  });
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: () => client.getSetupStatus(),
    staleTime: 30_000,
  });
}

export function useImageTemplates() {
  return useQuery({
    queryKey: ['image-templates'],
    queryFn: () => client.listImageTemplates(),
    refetchInterval: 10_000,
  });
}

export function useImageTemplate(id: number | null) {
  return useQuery({
    queryKey: ['image-templates', id],
    queryFn: () => client.getImageTemplate(id!),
    enabled: id !== null,
    refetchInterval: 10_000,
  });
}

export function useCreateImageTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateImageTemplateDto) => client.createImageTemplate(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['image-templates'] }),
  });
}

export function useRemoveImageTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.removeImageTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['image-templates'] }),
  });
}

export function useUpdateImageTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateImageTemplateDto }) =>
      client.updateImageTemplate(id, dto),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['image-templates'] });
      qc.invalidateQueries({ queryKey: ['image-templates', variables.id] });
    },
  });
}

export function useEnsureImageTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update, checkOnly }: { id: number; update?: boolean; checkOnly?: boolean }) =>
      client.ensureImageTemplate(id, update ?? false, checkOnly ?? false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['image-templates'] }),
  });
}

export function useEnsureImageTemplateStream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      update,
      onProgress,
    }: {
      id: number;
      update?: boolean;
      onProgress: (line: string) => void;
    }) => client.ensureImageTemplateStream(id, update ?? false, onProgress),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['image-templates'] }),
  });
}

export function useReorderAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => client.reorderAgents(ids),
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey: ['agents'] });
      const previous = qc.getQueryData<Agent[]>(['agents']);
      if (previous) {
        qc.setQueryData<Agent[]>(['agents'], previous.map((a) => {
          const pos = ids.indexOf(a.id);
          return { ...a, sortOrder: pos === -1 ? 0 : pos + 1 };
        }));
      }
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) qc.setQueryData(['agents'], context.previous);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useReorderImageTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => client.reorderImageTemplates(ids),
    onMutate: async (ids: number[]) => {
      await qc.cancelQueries({ queryKey: ['image-templates'] });
      const previous = qc.getQueryData<ImageTemplate[]>(['image-templates']);
      if (previous) {
        qc.setQueryData<ImageTemplate[]>(['image-templates'], previous.map((t) => {
          const pos = ids.indexOf(t.id);
          return { ...t, sortOrder: pos === -1 ? 0 : pos + 1 };
        }));
      }
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) qc.setQueryData(['image-templates'], context.previous);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['image-templates'] }),
  });
}
