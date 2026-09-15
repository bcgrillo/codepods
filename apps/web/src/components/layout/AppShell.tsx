import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PrimaryNav } from './PrimaryNav';
import { SecondaryPanel } from './SecondaryPanel';
import { AgentDetail } from '../agents/AgentDetail';
import { TemplatesGrid } from '../images/TemplatesGrid';
import { TemplateDetailView } from '../images/TemplateDetailView';
import { TemplateEditView } from '../images/TemplateEditView';
import { AiProviderDetail } from '../ai-providers/AiProviderDetail';
import { WorkspaceDetail } from '../workspaces/WorkspaceDetail';
import { McpServerDetail } from '../mcps/McpServerDetail';
import { ManagedApisPage } from '../managed-apis/ManagedApisPage';
import { SkillSourceDetail } from '../skills/SkillSourceDetail';
import { LocalSkillsPanel } from '../skills/LocalSkillsPanel';
import { SettingsPage } from '../settings/SettingsPage';
import { SecurityPage } from '../settings/SecurityPage';
import { AgentsMdSettingsSection } from '../agents-md/AgentsMdSettings';
import { UserSettingsPage } from '../settings/UserSettingsPage';
import { CreateAgentPage } from '../agents/CreateAgentPage';
import { CreateAiProviderPage } from '../ai-providers/CreateAiProviderPage';
import { CreateWorkspacePage } from '../workspaces/CreateWorkspacePage';
import { CreateMcpServerPage } from '../mcps/CreateMcpServerPage';
import { CreateSkillSourcePage } from '../skills/CreateSkillSourcePage';
import { Dashboard } from '../dashboard/Dashboard';
import { useUiStore } from '../../store/uiStore';
import { useAgents, useImageTemplates } from '../../hooks/useAgents';
import { useAiProviders } from '../../hooks/useAiProviders';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useMcpServers } from '../../hooks/useMcpServers';
import { useSkillSources } from '../../hooks/useSkills';
import { useAgentsMdList } from '../../hooks/useConfig';
import { useDiscoveredTemplates, useDiscoveredProviders } from '../../hooks/useCentralRepos';
import { serviceIdToUrlSegment, urlSegmentToServiceId } from '../../utils/agentServices';

type ActiveView = 'dashboard' | 'agents' | 'templates' | 'ai-providers' | 'mcps' | 'managed-apis' | 'skills' | 'workspaces' | 'security' | 'settings' | 'user';

function viewFromPathname(pathname: string): ActiveView {
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/agents/dashboard')) return 'dashboard';
  if (pathname.startsWith('/agents/templates')) return 'templates';
  if (pathname.startsWith('/ai-providers')) return 'ai-providers';
  if (pathname.startsWith('/mcps/managed-apis')) return 'managed-apis';
  if (pathname.startsWith('/mcps')) return 'mcps';
  if (pathname.startsWith('/skills')) return 'skills';
  if (pathname.startsWith('/workspaces')) return 'workspaces';
  if (pathname.startsWith('/security')) return 'security';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/user')) return 'user';
  return 'agents';
}

function isCreateRoute(pathname: string): boolean {
  return /^\/(agents\/templates|ai-providers|workspaces|mcps|skills)\/new$/.test(pathname)
    || pathname === '/agents/new';
}

export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const {
    activeView,
    selectedAgentId,
    selectedImageTemplateId,
    selectedAiProviderId,
    selectedWorkspaceId,
    selectedMcpServerId,
    selectedSkillSourceId,
    selectedAgentsMdId,
    settingsSection,
    securitySection,
    userSection,
    activeServiceByAgent,
    setActiveView,
    setSelectedAgent,
    setSelectedImageTemplate,
    setSelectedAiProvider,
    setSelectedWorkspace,
    setSelectedMcpServer,
    setSelectedSkillSource,
    setSelectedAgentsMd,
    setSettingsSection,
    setSecuritySection,
    setUserSection,
    setActiveService,
  } = useUiStore();

  const { data: agents } = useAgents();
  const { data: templates } = useImageTemplates();
  const { data: providers } = useAiProviders();
  const { data: workspaces } = useWorkspaces();
  const { data: mcpServers } = useMcpServers();
  const { data: skillSources } = useSkillSources();
  const { data: agentsMdList } = useAgentsMdList();
  // Preload discovery data so create-flow wizards don't show a loading flash
  useDiscoveredTemplates();
  useDiscoveredProviders();

  // Select the default AGENTS.md version when opening the AGENTS.md view
  // without an explicit version in the URL.
  useEffect(() => {
    if (
      location.pathname.includes('/workspaces/agents-md') &&
      !params.agentsMdId &&
      selectedAgentsMdId == null &&
      agentsMdList &&
      agentsMdList.length > 0
    ) {
      const def = agentsMdList.find((a) => a.isDefault) ?? agentsMdList[0];
      if (def) setSelectedAgentsMd(def.id);
    }
  }, [location.pathname, params.agentsMdId, selectedAgentsMdId, agentsMdList, setSelectedAgentsMd]);

  // --- URL → store sync (resolve name/slug → ID) ---
  useEffect(() => {
    const view = viewFromPathname(location.pathname);
    setActiveView(view);

    const agentName = params.agentName;
    const serviceName = params.serviceName;
    const templateSlug = params.templateSlug;
    const providerSlug = params.providerSlug;
    const workspaceSlug = params.workspaceSlug;
    const serverSlug = params.serverSlug;
    const skillSourceParam = params.sourceId;

    if (view === 'agents' && agentName) {
      const found = agents?.find((a) => a.name === decodeURIComponent(agentName));
      if (found && found.id !== selectedAgentId) {
        setSelectedAgent(found.id);
      }
      // Sync service from URL
      if (found && serviceName) {
        const svc = decodeURIComponent(serviceName);
        const resolvedId = urlSegmentToServiceId(svc);
        setActiveService(found.id, resolvedId);
      }
    }
    if (view === 'templates' || view === 'dashboard') {
      // Deselect agent when entering templates/dashboard view (sub-sections of agents)
      if (selectedAgentId !== null) setSelectedAgent(null);
      if (templateSlug && templateSlug !== 'new') {
        const name = decodeURIComponent(templateSlug);
        const found = templates?.find((t) => t.name === name);
        if (found && found.id !== selectedImageTemplateId) {
          setSelectedImageTemplate(found.id);
        }
      } else if (selectedImageTemplateId !== null) {
        setSelectedImageTemplate(null);
      }
    }
    if (view === 'ai-providers' && providerSlug) {
      const slug = decodeURIComponent(providerSlug);
      const found = providers?.find((p) => p.slug === slug);
      if (found && found.id !== selectedAiProviderId) {
        setSelectedAiProvider(found.id);
      }
    }
    if (view === 'workspaces' && workspaceSlug) {
      const slug = decodeURIComponent(workspaceSlug);
      const found = workspaces?.find((w) => w.slug === slug);
      if (found && found.id !== selectedWorkspaceId) {
        setSelectedWorkspace(found.id);
      }
    }
    if (view === 'mcps' && serverSlug && serverSlug !== 'new') {
      const slug = decodeURIComponent(serverSlug);
      const found = mcpServers?.find((s) => s.slug === slug);
      if (found && found.id !== selectedMcpServerId) {
        setSelectedMcpServer(found.id);
      }
    }
    if (view === 'skills' && skillSourceParam && skillSourceParam !== 'new') {
      if (skillSourceParam === 'local') {
        if (selectedSkillSourceId !== null) setSelectedSkillSource(null);
      } else {
        const id = Number(decodeURIComponent(skillSourceParam));
        if (!Number.isNaN(id) && id !== selectedSkillSourceId) {
          setSelectedSkillSource(id);
        }
      }
    }
    if (view === 'settings' && params.settingsSection) {
      const section = params.settingsSection as 'general' | 'dependencies' | 'repositories';
      if (section !== settingsSection) {
        setSettingsSection(section);
      }
    }
    if (view === 'security' && params.securitySection) {
      const section = params.securitySection as 'network' | 'credentials' | 'docker' | 'git';
      if (section !== securitySection) {
        setSecuritySection(section);
      }
    }
    if (view === 'workspaces' && location.pathname.includes('/workspaces/agents-md') && params.agentsMdId) {
      const id = Number(decodeURIComponent(params.agentsMdId));
      if (!Number.isNaN(id) && id !== selectedAgentsMdId) {
        setSelectedAgentsMd(id);
      }
    }
    if (view === 'user' && params.userSection) {
      const section = params.userSection as 'password' | 'devices' | 'logout';
      if (section !== userSection) {
        setUserSection(section);
      }
    }
  }, [location.pathname, params.agentName, params.serviceName, params.templateSlug, params.providerSlug,   params.workspaceSlug, params.serverSlug, params.apiId, params.sourceId, params.settingsSection, params.securitySection, params.userSection, params.agentsMdId, agents, templates, providers, workspaces, mcpServers, skillSources, agentsMdList, selectedAgentId, selectedImageTemplateId, selectedAiProviderId, selectedWorkspaceId, selectedMcpServerId, selectedSkillSourceId, selectedAgentsMdId, settingsSection, securitySection, userSection, setActiveView, setSelectedAgent, setSelectedImageTemplate, setSelectedAiProvider, setSelectedWorkspace, setSelectedMcpServer, setSelectedSkillSource, setSelectedAgentsMd, setSettingsSection, setSecuritySection, setUserSection, setActiveService]);

  // --- dynamic document title ---
  const currentView = viewFromPathname(location.pathname);
  const viewLabel =
    currentView === 'dashboard' ? t('nav.dashboard')
    : currentView === 'agents' ? t('nav.agents')
    : currentView === 'templates' ? t('nav.templates')
    : currentView === 'workspaces' ? t('nav.workspaces')
    : currentView === 'mcps' ? t('nav.mcps')
    : currentView === 'managed-apis' ? t('nav.managedApis')
    : currentView === 'skills' ? t('nav.skills')
    : currentView === 'security' ? t('nav.security')
    : currentView === 'settings' ? t('nav.settings')
    : currentView === 'user' ? t('nav.profile')
    : t('nav.aiProviders');
  const selectedItemName =
    currentView === 'agents'
      ? agents?.find((a) => a.id === selectedAgentId)?.name
      : currentView === 'templates'
        ? templates?.find((tm) => tm.id === selectedImageTemplateId)?.name
        : currentView === 'workspaces'
          ? location.pathname.includes('/workspaces/agents-md')
            ? agentsMdList?.find((a) => a.id === selectedAgentsMdId)?.alias
            : workspaces?.find((w) => w.id === selectedWorkspaceId)?.name
          : currentView === 'mcps'
            ? mcpServers?.find((s) => s.id === selectedMcpServerId)?.name
            : providers?.find((p) => p.id === selectedAiProviderId)?.name;
  const activeServiceSegment =
    currentView === 'agents' && selectedAgentId
      ? (() => {
          const svc = activeServiceByAgent[selectedAgentId];
          if (!svc) return null;
          return serviceIdToUrlSegment(svc);
        })()
      : null;

  useEffect(() => {
    document.title = selectedItemName
      ? activeServiceSegment
        ? `CodePods · ${viewLabel} · ${selectedItemName} · ${activeServiceSegment}`
        : `CodePods · ${viewLabel} · ${selectedItemName}`
      : `CodePods · ${viewLabel}`;
  }, [viewLabel, selectedItemName, activeServiceSegment]);

  // --- store → URL sync (resolve ID → name/slug) ---
  let targetPath: string;
  if (currentView === 'dashboard') {
    if (location.pathname === '/agents/dashboard/cleanup') {
      targetPath = '/agents/dashboard/cleanup';
    } else if (location.pathname === '/agents/dashboard/agents-stats') {
      targetPath = '/agents/dashboard/agents-stats';
    } else {
      targetPath = '/agents/dashboard';
    }
  } else if (currentView === 'agents') {
    const name = agents?.find((a) => a.id === selectedAgentId)?.name;
    const activeSvc = selectedAgentId ? activeServiceByAgent[selectedAgentId] : null;
    const svcSegment = activeSvc ? serviceIdToUrlSegment(activeSvc) : null;
    targetPath = name
      ? svcSegment
        ? `/agents/${encodeURIComponent(name)}/${encodeURIComponent(svcSegment)}`
        : `/agents/${encodeURIComponent(name)}`
      : '/agents';
  } else if (currentView === 'templates') {
    const name = templates?.find((t) => t.id === selectedImageTemplateId)?.name;
    targetPath = name ? `/agents/templates/${encodeURIComponent(name)}` : '/agents/templates';
  } else if (currentView === 'workspaces') {
    if (location.pathname.includes('/workspaces/agents-md')) {
      targetPath = selectedAgentsMdId
        ? `/workspaces/agents-md/${selectedAgentsMdId}`
        : '/workspaces/agents-md';
    } else {
      const slug = workspaces?.find((w) => w.id === selectedWorkspaceId)?.slug;
      targetPath = slug ? `/workspaces/${encodeURIComponent(slug)}` : '/workspaces';
    }
  } else if (currentView === 'mcps') {
    const slug = mcpServers?.find((s) => s.id === selectedMcpServerId)?.slug;
    targetPath = slug ? `/mcps/${encodeURIComponent(slug)}` : '/mcps';
  } else if (currentView === 'managed-apis') {
    targetPath = '/mcps/managed-apis';
  } else if (currentView === 'skills') {
    targetPath = selectedSkillSourceId === null
      ? '/skills/local'
      : `/skills/${selectedSkillSourceId}`;
  } else if (currentView === 'settings') {
    if (settingsSection && settingsSection !== 'general') {
      targetPath = `/settings/${settingsSection}`;
    } else {
      targetPath = '/settings';
    }
  } else if (currentView === 'security') {
    if (securitySection) {
      targetPath = `/security/${securitySection}`;
    } else {
      targetPath = '/security/network';
    }
  } else if (currentView === 'user') {
    targetPath = userSection === 'password' ? '/user' : `/user/${userSection}`;
  } else {
    const slug = providers?.find((p) => p.id === selectedAiProviderId)?.slug;
    targetPath = slug ? `/ai-providers/${encodeURIComponent(slug)}` : '/ai-providers';
  }

  useEffect(() => {
    if (targetPath === location.pathname) return;
    // Don't override create routes (/X/new) — the create page owns the URL.
    if (isCreateRoute(location.pathname)) return;
    // Don't override /agents/templates/new (create form trigger) until user selects something
    if (location.pathname === '/agents/templates/new' && currentView === 'templates' && !selectedImageTemplateId) return;
    // Don't override the URL when a section is empty — the empty-state
    // redirect will send the user to the /X/new create page instead.
    if (currentView === 'agents' && agents && agents.length === 0) return;
    if (currentView === 'templates' && templates && templates.length === 0) return;
    if (currentView === 'ai-providers' && providers && providers.length === 0) return;
    if (currentView === 'workspaces' && workspaces && workspaces.length === 0) return;
    if (currentView === 'mcps' && mcpServers && mcpServers.length === 0) return;
    // Don't override URL while data is still loading — the URL may have
    // a deep link (e.g. /agents/copilot-3/console) that we need to resolve
    // once agents are available.
    if (currentView === 'agents' && !agents) return;
    if (currentView === 'templates' && !templates) return;
    if (currentView === 'ai-providers' && !providers) return;
    if (currentView === 'workspaces' && !workspaces) return;
    if (currentView === 'mcps' && !mcpServers) return;
    if (currentView === 'skills' && !skillSources) return;
    // Don't strip service segment from URL before we've had a chance to
    // resolve the agent and sync the service into the store.
    if (currentView === 'agents' && params.agentName && !selectedAgentId) return;
    // Don't redirect store→URL when the URL already points to a valid workspace
    // that hasn't been synced to the store yet (e.g. clicked from AgentDetail).
    if (currentView === 'workspaces' && params.workspaceSlug && workspaces) {
      const urlWs = workspaces.find((w) => w.slug === decodeURIComponent(params.workspaceSlug!));
      if (urlWs && urlWs.id !== selectedWorkspaceId) return;
    }
    // Don't override URL when the selected item isn't in the data yet
    // (e.g. a newly created agent/workspace that hasn't been refetched).
    if (currentView === 'agents' && selectedAgentId && agents && !agents.find((a) => a.id === selectedAgentId)) {
      // The selected agent no longer exists (was deleted) — clear selection
      // so AgentDetail shows the empty state instead of stale cached data.
      setSelectedAgent(null);
      return;
    }
    if (currentView === 'workspaces' && selectedWorkspaceId && workspaces && !workspaces.find((w) => w.id === selectedWorkspaceId)) return;
    if (currentView === 'mcps' && selectedMcpServerId && mcpServers && !mcpServers.find((s) => s.id === selectedMcpServerId)) return;
    if (currentView === 'skills' && selectedSkillSourceId !== null && skillSources && !skillSources.find((s) => s.id === selectedSkillSourceId)) return;
    if (currentView === 'templates' && selectedImageTemplateId && templates && !templates.find((t) => t.id === selectedImageTemplateId)) return;
    if (currentView === 'ai-providers' && selectedAiProviderId && providers && !providers.find((p) => p.id === selectedAiProviderId)) return;
    navigate(targetPath, { replace: true });
  }, [targetPath]);

  // --- empty-state auto-redirect: when a section has no content, show the
  // "new X" create page automatically ---
  useEffect(() => {
    if (isCreateRoute(location.pathname)) return;
    const view = viewFromPathname(location.pathname);
    if (view === 'settings') return;
    if (view === 'security') return;
    if (view === 'user') return;
    if (view === 'workspaces' && location.pathname.includes('/workspaces/agents-md')) return;
    // If entering /agents (not /agents/dashboard or /agents/templates) without
    // a selected agent, redirect to the dashboard sub-page.
    if (view === 'agents' && !params.agentName && !selectedAgentId && agents) {
      navigate('/agents/dashboard', { replace: true });
      return;
    }
    const isEmpty =
      (view === 'agents' && agents && agents.length === 0) ||
      (view === 'ai-providers' && providers && providers.length === 0) ||
      (view === 'workspaces' && workspaces && workspaces.length === 0) ||
      (view === 'mcps' && mcpServers && mcpServers.length === 0);
    if (isEmpty) {
      navigate(`/${view}/new`, { replace: true });
    }
  }, [location.pathname, agents, templates, providers, workspaces, mcpServers, navigate, params.agentName, selectedAgentId]);

  const creating = isCreateRoute(location.pathname);

  return (
    <div className="flex h-full w-full gap-2 bg-page-background p-2 text-card-foreground">
      <PrimaryNav />
      <SecondaryPanel />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-panel-background shadow-sm">
        {activeView === 'dashboard' && <Dashboard />}
        {activeView === 'agents' && (creating ? <CreateAgentPage /> : <AgentDetail agentId={selectedAgentId} />)}
        {activeView === 'templates' && (creating ? <TemplateEditView /> : selectedImageTemplateId ? <TemplateDetailView templateId={selectedImageTemplateId} /> : <TemplatesGrid />)}
        {activeView === 'ai-providers' && (creating ? <CreateAiProviderPage /> : <AiProviderDetail providerId={selectedAiProviderId} />)}
        {activeView === 'workspaces' && (
          location.pathname.includes('/workspaces/agents-md')
            ? <AgentsMdSettingsSection selectedId={selectedAgentsMdId} onSelect={setSelectedAgentsMd} />
            : creating ? <CreateWorkspacePage /> : <WorkspaceDetail workspaceId={selectedWorkspaceId} />
        )}
        {activeView === 'mcps' && (creating ? <CreateMcpServerPage /> : <McpServerDetail serverId={selectedMcpServerId} />)}
        {activeView === 'managed-apis' && <ManagedApisPage />}
        {activeView === 'skills' && (creating ? <CreateSkillSourcePage /> : selectedSkillSourceId === null ? <LocalSkillsPanel /> : <SkillSourceDetail sourceId={selectedSkillSourceId} />)}
        {activeView === 'settings' && <SettingsPage />}
        {activeView === 'security' && <SecurityPage />}
        {activeView === 'user' && <UserSettingsPage />}
      </main>
    </div>
  );
}
