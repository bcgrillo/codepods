import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from './uiStore';

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({
      primaryNavExpanded: false,
      activeView: 'agents',
      settingsSection: 'general',
      selectedAgentId: null,
      selectedImageTemplateId: null,
      selectedAiProviderId: null,
      selectedWorkspaceId: null,
      selectedAgentsMdId: null,
      activeServiceByAgent: {},
      autoShowCreationLog: false,
    });
  });

  it('toggles primary nav expansion', () => {
    useUiStore.getState().togglePrimaryNav();
    expect(useUiStore.getState().primaryNavExpanded).toBe(true);
    useUiStore.getState().togglePrimaryNav();
    expect(useUiStore.getState().primaryNavExpanded).toBe(false);
  });

  it('sets the active view', () => {
    useUiStore.getState().setActiveView('settings');
    expect(useUiStore.getState().activeView).toBe('settings');
  });

  it('sets the settings section', () => {
    useUiStore.getState().setSettingsSection('dependencies');
    expect(useUiStore.getState().settingsSection).toBe('dependencies');
  });

  it('sets the selected ids', () => {
    const s = useUiStore.getState();
    s.setSelectedAgent('a1');
    s.setSelectedImageTemplate(2);
    s.setSelectedAiProvider(3);
    s.setSelectedWorkspace(4);
    s.setSelectedAgentsMd(5);
    const st = useUiStore.getState();
    expect(st.selectedAgentId).toBe('a1');
    expect(st.selectedImageTemplateId).toBe(2);
    expect(st.selectedAiProviderId).toBe(3);
    expect(st.selectedWorkspaceId).toBe(4);
    expect(st.selectedAgentsMdId).toBe(5);
  });

  it('sets and overwrites the active service per agent', () => {
    useUiStore.getState().setActiveService('agent-x', 'svc-1');
    useUiStore.getState().setActiveService('agent-y', 'svc-2');
    useUiStore.getState().setActiveService('agent-x', null);
    const s = useUiStore.getState();
    expect(s.activeServiceByAgent['agent-x']).toBe(null);
    expect(s.activeServiceByAgent['agent-y']).toBe('svc-2');
  });

  it('sets autoShowCreationLog', () => {
    useUiStore.getState().setAutoShowCreationLog(true);
    expect(useUiStore.getState().autoShowCreationLog).toBe(true);
  });
});
