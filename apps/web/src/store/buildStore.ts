import { create } from 'zustand';
import { agentsClient } from '../hooks/useAgents';
import { queryClient } from '../lib/queryClient';

export interface BuildState {
  isBuilding: boolean;
  output: string[];
  error: string | null;
  action: 'existing' | 'built' | 'missing' | null;
}

interface BuildStore {
  builds: Record<number, BuildState>;
  startBuild: (templateId: number, update: boolean) => Promise<void>;
  clearBuild: (templateId: number) => void;
}

function parseApiErrorPayload(error: unknown): { code?: string; message?: string; buildOutput?: string[] } | null {
  if (!(error instanceof Error)) return null;
  if (!error.message.startsWith('API ')) return null;
  const separator = ': ';
  const idx = error.message.indexOf(separator);
  if (idx < 0) return null;
  try {
    return JSON.parse(error.message.slice(idx + separator.length)) as {
      code?: string;
      message?: string;
      buildOutput?: string[];
    };
  } catch {
    return null;
  }
}

export const useBuildStore = create<BuildStore>((set, get) => ({
  builds: {},
  startBuild: async (templateId, update) => {
    const existing = get().builds[templateId];
    if (existing?.isBuilding) return;

    set((s) => ({
      builds: {
        ...s.builds,
        [templateId]: { isBuilding: true, output: [], error: null, action: null },
      },
    }));

    try {
      const result = await agentsClient.ensureImageTemplateStream(templateId, update, (line) => {
        set((s) => {
          const prev = s.builds[templateId];
          if (!prev) return s;
          return {
            builds: {
              ...s.builds,
              [templateId]: { ...prev, output: [...prev.output, line] },
            },
          };
        });
      });

      set((s) => {
        const prev = s.builds[templateId];
        if (!prev) return s;
        return {
          builds: {
            ...s.builds,
            [templateId]: { ...prev, action: result.action },
          },
        };
      });

      queryClient.invalidateQueries({ queryKey: ['image-templates'] });
    } catch (error: unknown) {
      const parsed = parseApiErrorPayload(error);
      set((s) => {
        const prev = s.builds[templateId];
        if (!prev) return s;
        return {
          builds: {
            ...s.builds,
            [templateId]: {
              ...prev,
              error: parsed?.message ?? (error instanceof Error ? error.message : 'Error'),
              output: parsed?.buildOutput ?? prev.output,
            },
          },
        };
      });
    } finally {
      set((s) => {
        const prev = s.builds[templateId];
        if (!prev) return s;
        return {
          builds: {
            ...s.builds,
            [templateId]: { ...prev, isBuilding: false },
          },
        };
      });
    }
  },
  clearBuild: (templateId) => {
    set((s) => {
      const rest = { ...s.builds };
      delete rest[templateId];
      return { builds: rest };
    });
  },
}));