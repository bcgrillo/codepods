import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Bot,
  BrainCircuit,
  ChevronLeft,
  CloudCog,
  FolderGit2,
  Gauge,
  GraduationCap,
  HardDrive,
  IdCard,
  SwatchBook,
  Settings,
  Shield,
  User,
} from 'lucide-react';
import { AgentList } from '../agents/AgentList';
import { AiProviderList } from '../ai-providers/AiProviderList';
import { WorkspaceList } from '../workspaces/WorkspaceList';
import { McpServerList } from '../mcps/McpServerList';
import { SkillSourceList } from '../skills/SkillSourceList';
import { SettingsSubMenu } from '../settings/SettingsSubMenu';
import { SecuritySubMenu } from '../settings/SecuritySubMenu';
import { UserSubMenu } from '../settings/UserSubMenu';
import { McpIcon } from '../icons/McpIcon';
import { CodepodsLogo } from '../icons/CodepodsLogo';
import { useMcpServers } from '../../hooks/useMcpServers';
import { useUiStore } from '../../store/uiStore';
import { cn } from '@/lib/utils';

export function SecondaryPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activeView,
    settingsSection,
    setSettingsSection,
    securitySection,
    setSecuritySection,
    userSection,
    setUserSection,
    selectedAgentsMdId,
    selectedMcpServerId,
    selectedSkillSourceId,
    secondaryNavExpanded,
    toggleSecondaryNav,
  } = useUiStore();

  const { data: mcpServers } = useMcpServers();
  const builtInMcp = mcpServers?.find((s) => s.builtIn);
  const isCodepodsMcpActive = activeView === 'mcps'
    && builtInMcp != null
    && selectedMcpServerId === builtInMcp.id
    && !location.pathname.endsWith('/mcps/new');
  const isSkillsNew = location.pathname.endsWith('/skills/new');
  const isLocalSkillsActive = activeView === 'skills' && selectedSkillSourceId === null && !isSkillsNew;

  const title =
    activeView === 'agents' || activeView === 'templates' || activeView === 'dashboard'
      ? t('agents.title')
      : activeView === 'workspaces'
          ? t('workspaces.title')
          : activeView === 'mcps' || activeView === 'managed-apis'
            ? t('mcps.title')
            : activeView === 'skills'
                ? t('skills.title')
                : activeView === 'security'
                  ? t('nav.security')
                  : activeView === 'settings'
                    ? t('settings.title')
                    : activeView === 'user'
                      ? t('nav.profile')
                      : t('aiProviders.title');

  const sectionIcon =
    activeView === 'agents' || activeView === 'templates' || activeView === 'dashboard' ? (
      <Bot className="h-5 w-5" />
    ) : activeView === 'workspaces' ? (
      <FolderGit2 className="h-5 w-5" />
    ) : activeView === 'mcps' || activeView === 'managed-apis' ? (
      <McpIcon className="h-5 w-5" />
    ) : activeView === 'skills' ? (
      <GraduationCap className="h-5 w-5" />
    ) : activeView === 'security' ? (
      <Shield className="h-5 w-5" />
    ) : activeView === 'settings' ? (
      <Settings className="h-5 w-5" />
    ) : activeView === 'user' ? (
      <User className="h-5 w-5" />
    ) : (
      <BrainCircuit className="h-5 w-5" />
    );

  const handleSettingsSelect = (section: typeof settingsSection) => {
    setSettingsSection(section);
    navigate(section === 'general' ? '/settings' : `/settings/${section}`, { replace: true });
  };
  const handleSecuritySelect = (section: typeof securitySection) => {
    setSecuritySection(section);
    navigate(`/security/${section}`, { replace: true });
  };
  const handleUserSelect = (section: typeof userSection) => {
    setUserSection(section);
    navigate(`/user/${section}`, { replace: true });
  };

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-full rounded-xl border border-border bg-panel-background text-card-foreground shadow-sm transition-all duration-200 shrink-0 overflow-hidden',
        secondaryNavExpanded ? 'w-72' : 'w-14',
      )}
    >
      <div
        className={cn(
          'flex h-12 items-center border-b border-border shrink-0',
          secondaryNavExpanded ? 'justify-between px-4' : 'justify-center px-0',
        )}
      >
        {secondaryNavExpanded ? (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-primary-soft">{sectionIcon}</span>
              <h2 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={toggleSecondaryNav}
              className="btn-icon"
              aria-label={t('nav.collapseSidebar')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={toggleSecondaryNav}
            className="btn-icon text-primary-soft"
            aria-label={t('nav.expandSidebar')}
          >
            {sectionIcon}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeView === 'agents' || activeView === 'templates' || activeView === 'dashboard' ? (
          <AgentList collapsed={!secondaryNavExpanded} />
        ) : activeView === 'workspaces' ? (
          <WorkspaceList collapsed={!secondaryNavExpanded} />
        ) : activeView === 'mcps' || activeView === 'managed-apis' ? (
          <McpServerList collapsed={!secondaryNavExpanded} />
        ) : activeView === 'skills' ? (
          <SkillSourceList collapsed={!secondaryNavExpanded} />
        ) : activeView === 'settings' ? (
          <SettingsSubMenu section={settingsSection} onSelect={handleSettingsSelect} collapsed={!secondaryNavExpanded} />
        ) : activeView === 'security' ? (
          <SecuritySubMenu
            section={securitySection}
            onSelect={handleSecuritySelect}
            collapsed={!secondaryNavExpanded}
          />
        ) : activeView === 'user' ? (
          <UserSubMenu section={userSection} onSelect={handleUserSelect} collapsed={!secondaryNavExpanded} />
        ) : (
          <AiProviderList collapsed={!secondaryNavExpanded} />
        )}
      </div>

      {/* Bottom items — agents sub-sections: Dashboard + Templates */}
      {(activeView === 'agents' || activeView === 'templates' || activeView === 'dashboard') && (
        <div className={cn('border-t border-border shrink-0', secondaryNavExpanded ? 'px-2 py-2 space-y-1' : 'py-2')}>
          <BottomButton
            icon={Gauge}
            label={t('nav.dashboard')}
            active={activeView === 'dashboard'}
            expanded={secondaryNavExpanded}
            onClick={() => navigate('/agents/dashboard')}
          />
          <BottomButton
            icon={SwatchBook}
            label={t('nav.templates')}
            active={activeView === 'templates'}
            expanded={secondaryNavExpanded}
            onClick={() => navigate('/agents/templates')}
          />
        </div>
      )}

      {/* Bottom items — mcps sub-sections: CodePods MCP + Managed Apis */}
      {(activeView === 'mcps' || activeView === 'managed-apis') && (
        <div className={cn('border-t border-border shrink-0 space-y-1', secondaryNavExpanded ? 'px-2 py-2' : 'py-2')}>
          {builtInMcp && (
            <BottomButton
              icon={CodepodsLogo}
              label={t('mcps.codepodsMcp')}
              active={isCodepodsMcpActive}
              expanded={secondaryNavExpanded}
              onClick={() => navigate(`/mcps/${encodeURIComponent(builtInMcp.slug)}`)}
            />
          )}
          <BottomButton
            icon={CloudCog}
            label={t('nav.managedApis')}
            active={activeView === 'managed-apis'}
            expanded={secondaryNavExpanded}
            onClick={() => navigate('/mcps/managed-apis')}
          />
        </div>
      )}

      {/* Bottom items — skills: Local Skills */}
      {activeView === 'skills' && (
        <div className={cn('border-t border-border shrink-0', secondaryNavExpanded ? 'px-2 py-2 space-y-1' : 'py-2')}>
          <BottomButton
            icon={HardDrive}
            label={t('skills.localSkills')}
            active={isLocalSkillsActive}
            expanded={secondaryNavExpanded}
            onClick={() => navigate('/skills/local')}
          />
        </div>
      )}

      {/* Bottom items — workspaces: AGENTS.md */}
      {activeView === 'workspaces' && (
        <div className={cn('border-t border-border shrink-0', secondaryNavExpanded ? 'px-2 py-2 space-y-1' : 'py-2')}>
          <BottomButton
            icon={IdCard}
            label={t('agentsMd.title')}
            active={location.pathname.includes('/workspaces/agents-md')}
            expanded={secondaryNavExpanded}
            onClick={() => navigate(selectedAgentsMdId ? `/workspaces/agents-md/${selectedAgentsMdId}` : '/workspaces/agents-md')}
          />
        </div>
      )}
    </aside>
  );
}

function BottomButton({
  icon: Icon,
  label,
  active,
  expanded,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex items-center justify-center h-9 w-9 mx-auto rounded-md transition-colors',
          active ? 'bg-primary/15 text-primary-soft' : 'text-foreground/70 hover:bg-primary/10 hover:text-primary-soft',
        )}
        title={label}
        aria-current={active ? 'page' : undefined}
      >
        <Icon className="h-5 w-5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('nav-item', active && 'nav-item-active')}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
