import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SkillsClient } from '@codepods/sdk';
import type { Skill, SkillSource } from '@codepods/shared-types';
import type { CreateSkillSourceDto, UpdateSkillSourceDto } from '@codepods/sdk';

export const skillsClient = new SkillsClient('/api');
const client = skillsClient;

const SOURCES_QK = ['skill-sources'] as const;
const SKILLS_QK = ['skills'] as const;

// ---- sources ----

export function useSkillSources() {
  return useQuery<SkillSource[]>({
    queryKey: SOURCES_QK,
    queryFn: () => client.listSources(),
  });
}

export function useSkillSource(id: number | null) {
  return useQuery<SkillSource>({
    queryKey: [...SOURCES_QK, id],
    queryFn: () => client.getSource(id!),
    enabled: id !== null,
  });
}

export function useCreateSkillSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateSkillSourceDto) => client.createSource(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOURCES_QK }),
  });
}

export function useUpdateSkillSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: UpdateSkillSourceDto }) =>
      client.updateSource(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOURCES_QK }),
  });
}

export function useRemoveSkillSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.removeSource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOURCES_QK }),
  });
}

export function useReorderSkillSources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => client.reorderSources(ids),
    onMutate: async (ids: number[]) => {
      await qc.cancelQueries({ queryKey: [...SOURCES_QK] });
      const previous = qc.getQueryData<SkillSource[]>([...SOURCES_QK]);
      if (previous) {
        qc.setQueryData<SkillSource[]>([...SOURCES_QK], previous.map((s) => {
          const pos = ids.indexOf(s.id);
          return { ...s, sortOrder: pos === -1 ? 0 : pos + 1 };
        }));
      }
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) qc.setQueryData([...SOURCES_QK], context.previous);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...SOURCES_QK] }),
  });
}

export function useSyncSkillSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.syncSource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOURCES_QK }),
  });
}

// ---- skills by source ----

export function useSkillsBySource(sourceId: number | null) {
  return useQuery<Skill[]>({
    queryKey: [...SOURCES_QK, sourceId, 'skills'],
    queryFn: () => client.listSkillsBySource(sourceId!),
    enabled: sourceId !== null,
  });
}

export function useAllSkills() {
  return useQuery<Skill[]>({
    queryKey: [...SKILLS_QK, 'all'],
    queryFn: () => client.listAllSkills(),
  });
}

// ---- local skills ----

export function useLocalSkills() {
  return useQuery<Skill[]>({
    queryKey: [...SKILLS_QK, 'local'],
    queryFn: () => client.listLocalSkills(),
  });
}

export function useUploadLocalSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) =>
      client.uploadLocalSkill(name, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...SKILLS_QK, 'local'] });
      qc.invalidateQueries({ queryKey: SOURCES_QK });
    },
  });
}

export function useRenameSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      client.renameSkill(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...SKILLS_QK, 'local'] });
      qc.invalidateQueries({ queryKey: SOURCES_QK });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.deleteSkill(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...SKILLS_QK, 'local'] });
      qc.invalidateQueries({ queryKey: SOURCES_QK });
    },
  });
}