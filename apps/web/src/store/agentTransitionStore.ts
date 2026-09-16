import { create } from 'zustand';

export type AgentTransition = 'starting' | 'stopping' | 'restarting' | 'recreating' | 'deleting';

interface AgentTransitionStore {
  transitions: Record<string, AgentTransition>;
  setTransition: (agentId: string, transition: AgentTransition | null) => void;
}

export const useAgentTransitionStore = create<AgentTransitionStore>((set) => ({
  transitions: {},
  setTransition: (agentId, transition) => {
    set((s) => {
      if (transition === null) {
        const rest = { ...s.transitions };
        delete rest[agentId];
        return { transitions: rest };
      }
      return { transitions: { ...s.transitions, [agentId]: transition } };
    });
  },
}));