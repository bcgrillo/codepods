import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ActiveView = 'dashboard' | 'agents' | 'templates' | 'ai-providers' | 'mcps' | 'managed-apis' | 'skills' | 'workspaces' | 'security' | 'settings' | 'user';
export type SettingsSection = 'general' | 'dependencies' | 'repositories' | 'about';
export type SecuritySection = 'network' | 'credentials' | 'docker' | 'git';
export type UserSection = 'password' | 'devices' | 'logout';

interface UiStore {
  primaryNavExpanded: boolean;
  secondaryNavExpanded: boolean;
  activeView: ActiveView;
  settingsSection: SettingsSection;
  securitySection: SecuritySection;
  userSection: UserSection;
  selectedAgentId: string | null;
  selectedImageTemplateId: number | null;
  selectedAiProviderId: number | null;
  selectedWorkspaceId: number | null;
  selectedMcpServerId: number | null;
  selectedManagedApiId: number | null;
  selectedSkillSourceId: number | null;
  selectedAgentsMdId: number | null;
  activeServiceByAgent: Record<string, string | null>;
  autoShowCreationLog: boolean;
  workspaceDrawerOpen: boolean;
  togglePrimaryNav: () => void;
  toggleSecondaryNav: () => void;
  setActiveView: (view: ActiveView) => void;
  setSettingsSection: (section: SettingsSection) => void;
  setSecuritySection: (section: SecuritySection) => void;
  setUserSection: (section: UserSection) => void;
  setSelectedAgent: (id: string | null) => void;
  setSelectedImageTemplate: (id: number | null) => void;
  setSelectedAiProvider: (id: number | null) => void;
  setSelectedWorkspace: (id: number | null) => void;
  setSelectedMcpServer: (id: number | null) => void;
  setSelectedManagedApi: (id: number | null) => void;
  setSelectedSkillSource: (id: number | null) => void;
  setSelectedAgentsMd: (id: number | null) => void;
  setActiveService: (agentId: string, serviceId: string | null) => void;
  setAutoShowCreationLog: (v: boolean) => void;
  setWorkspaceDrawerOpen: (v: boolean) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
  primaryNavExpanded: false,
  secondaryNavExpanded: true,
  activeView: 'agents',
  settingsSection: 'general',
  securitySection: 'network',
  userSection: 'password',
  selectedAgentId: null,
  selectedImageTemplateId: null,
  selectedAiProviderId: null,
  selectedWorkspaceId: null,
  selectedMcpServerId: null,
  selectedManagedApiId: null,
  selectedSkillSourceId: null,
  selectedAgentsMdId: null,
  activeServiceByAgent: {},
  autoShowCreationLog: false,
  workspaceDrawerOpen: false,
  togglePrimaryNav: () => set((s) => ({ primaryNavExpanded: !s.primaryNavExpanded })),
  toggleSecondaryNav: () => set((s) => ({ secondaryNavExpanded: !s.secondaryNavExpanded })),
  setActiveView: (activeView) => set({ activeView }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  setSecuritySection: (securitySection) => set({ securitySection }),
  setUserSection: (userSection) => set({ userSection }),
  setSelectedAgent: (selectedAgentId) => set({ selectedAgentId }),
  setSelectedImageTemplate: (selectedImageTemplateId) => set({ selectedImageTemplateId }),
  setSelectedAiProvider: (selectedAiProviderId) => set({ selectedAiProviderId }),
  setSelectedWorkspace: (selectedWorkspaceId) => set({ selectedWorkspaceId }),
  setSelectedMcpServer: (selectedMcpServerId) => set({ selectedMcpServerId }),
  setSelectedManagedApi: (selectedManagedApiId) => set({ selectedManagedApiId }),
  setSelectedSkillSource: (selectedSkillSourceId) => set({ selectedSkillSourceId }),
  setSelectedAgentsMd: (selectedAgentsMdId) => set({ selectedAgentsMdId }),
  setActiveService: (agentId, serviceId) =>
    set((s) => ({
      activeServiceByAgent: {
        ...s.activeServiceByAgent,
        [agentId]: serviceId,
      },
    })),
  setAutoShowCreationLog: (autoShowCreationLog) => set({ autoShowCreationLog }),
  setWorkspaceDrawerOpen: (workspaceDrawerOpen) => set({ workspaceDrawerOpen }),
    }),
    {
      name: 'codepods-ui-nav',
      partialize: (s) => ({
        primaryNavExpanded: s.primaryNavExpanded,
        secondaryNavExpanded: s.secondaryNavExpanded,
        workspaceDrawerOpen: s.workspaceDrawerOpen,
      }),
    },
  ),
);
