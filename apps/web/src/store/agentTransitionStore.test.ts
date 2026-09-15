import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentTransitionStore } from './agentTransitionStore';

describe('useAgentTransitionStore', () => {
  beforeEach(() => {
    useAgentTransitionStore.setState({ transitions: {} });
  });

  it('records a transition for an agent', () => {
    useAgentTransitionStore.getState().setTransition('a1', 'starting');
    expect(useAgentTransitionStore.getState().transitions).toEqual({ a1: 'starting' });
  });

  it('overwrites an existing transition', () => {
    const s = useAgentTransitionStore.getState();
    s.setTransition('a1', 'starting');
    s.setTransition('a1', 'restarting');
    expect(useAgentTransitionStore.getState().transitions.a1).toBe('restarting');
  });

  it('removes a transition when cleared', () => {
    const s = useAgentTransitionStore.getState();
    s.setTransition('a1', 'stopping');
    s.setTransition('a2', 'starting');
    s.setTransition('a1', null);
    expect(useAgentTransitionStore.getState().transitions).toEqual({ a2: 'starting' });
  });

  it('supports deleting as a transition', () => {
    useAgentTransitionStore.getState().setTransition('a1', 'deleting');
    expect(useAgentTransitionStore.getState().transitions).toEqual({ a1: 'deleting' });
  });
});
