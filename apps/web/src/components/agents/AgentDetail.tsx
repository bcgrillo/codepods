import React from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square, RotateCw, Globe, SquareTerminal, SquareArrowOutUpRight, Settings, Pencil, Check, X, Power, PanelRight } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle, usePanelRef, useDefaultLayout } from '../ui/resizable';
import { TemplateIcon } from '../templates/TemplateIcon';
import type { AgentService, AgentStatus } from '@codepods/shared-types';
import { useAgent, useStartAgent, useStopAgent, useRestartAgent, useRenameAgent, useAgentServices, agentsClient } from '../../hooks/useAgents';
import { useWorkspaceInfo } from '../../hooks/useWorkspaces';
import { useAgentTransitionStore } from '../../store/agentTransitionStore';
import { useUiStore } from '../../store/uiStore';
import { AgentConsole } from '../console/AgentConsole';
import { AgentSettings } from './AgentSettings';
import { AgentLogsView } from './AgentLogsView';
import { AgentNotices } from './AgentNotices';
import { WorkspaceDrawer } from '../workspaces/WorkspaceDrawer';
import { AgentRequests } from './AgentRequests';
import { cx } from '../../utils/cx';
import { ActionButton } from '../ui/ActionButton';
import { ContentShell } from '../ContentShell';
import { ContentHeaderAction } from '../ContentHeader';
import {
  CONSOLE_SERVICE_ID,
  SETTINGS_SERVICE_ID,
  ACTIVITY_LOG_SERVICE_ID,
  CONTAINER_LOG_SERVICE_ID,
} from '../../utils/agentServices';

interface AgentDetailProps {
  agentId: string | null;
}

const statusBadgeVariant: Record<AgentStatus, 'default' | 'secondary' | 'outline' | 'destructive' | 'success'> = {
  running: 'success',
  stopped: 'secondary',
  exited: 'destructive',
  paused: 'secondary',
  unknown: 'secondary',
};

export function AgentDetail({ agentId }: AgentDetailProps) {
  const { t } = useTranslation();
  const { activeServiceByAgent, setActiveService, autoShowCreationLog, setAutoShowCreationLog, workspaceDrawerOpen, setWorkspaceDrawerOpen } = useUiStore();
  const [logStreaming, setLogStreaming] = React.useState(false);
  const { data: agent, isLoading } = useAgent(agentId, logStreaming ? 1000 : 5000);
  const startAgent = useStartAgent();
  const stopAgent = useStopAgent();
  const restartAgent = useRestartAgent();
  const renameAgent = useRenameAgent();
  const setTransition = useAgentTransitionStore((s) => s.setTransition);
  const transition = useAgentTransitionStore((s) => (agentId ? s.transitions[agentId] : undefined));
  const { data: services } = useAgentServices(agentId);
  const { data: workspaceInfo } = useWorkspaceInfo(agent?.workspaceId ?? null);

  const [isEditingName, setIsEditingName] = React.useState(false);
  const [editName, setEditName] = React.useState('');
  const [nameError, setNameError] = React.useState<string | null>(null);
  const drawerPanelRef = usePanelRef();
  // Tracks whether the panel group's initial mount layout has been reconciled
  // into the uiStore (prevents remounts — e.g. returning from a full-content
  // log view — from re-flipping the drawer state).
  const drawerMountedRef = React.useRef(false);
  const hasWorkspace = agent?.workspaceId != null && agent?.workspaceName != null;
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'agent-workspace-drawer',
    panelIds: ['main', 'drawer'],
    // Persist EVERY layout commit (including programmatic collapse/expand
    // from the drawer toggle), otherwise closing the drawer is forgotten:
    // the log-view early-return unmounts the panel group and the remount
    // replays the stale persisted layout, which re-opens the drawer.
    onlySaveAfterUserInteractions: false,
  });

  // Keep the uiStore drawer flag in sync with the persisted layout, but only
  // when the user actually dragged/resized the panels. Library-driven commits
  // (initial mount, programmatic collapse from the toggle) are already
  // reflected by the direct store setter; filtering them here prevents a mount
  // remount from flipping the flag behind the user's back. The exception is
  // the very first mount, where the persisted layout (e.g. left open in a
  // previous session) must be reflected in the store so the header toggle
  // agrees with what the user sees.
  const onLayoutChangedWithSync: typeof onLayoutChanged = (layout, meta) => {
    onLayoutChanged(layout, meta);
    if (meta.isUserInteraction) {
      const drawerCollapsed = (layout.drawer ?? 0) <= 0;
      if (drawerCollapsed && workspaceDrawerOpen) setWorkspaceDrawerOpen(false);
      if (!drawerCollapsed && !workspaceDrawerOpen) setWorkspaceDrawerOpen(true);
    } else if (drawerMountedRef.current === false) {
      drawerMountedRef.current = true;
      const drawerCollapsed = (layout.drawer ?? 0) <= 0;
      if (drawerCollapsed !== !workspaceDrawerOpen) setWorkspaceDrawerOpen(!drawerCollapsed);
    }
  };

  // Sync drawer panel collapse/expand with uiStore state
  React.useEffect(() => {
    if (!hasWorkspace) return;
    if (workspaceDrawerOpen) {
      drawerPanelRef.current?.expand();
    } else {
      drawerPanelRef.current?.collapse();
    }
  }, [workspaceDrawerOpen, hasWorkspace]);

  // Auto-open creation log when arriving from CreateAgentModal with showLog checked
  React.useEffect(() => {
    if (autoShowCreationLog && agentId) {
      setLogStreaming(true);
      setAutoShowCreationLog(false);
    }
  }, [autoShowCreationLog, setAutoShowCreationLog, agentId]);

  // Stop fast polling when creation log is complete
  React.useEffect(() => {
    if (logStreaming && agent?.creationLog?.includes(t('agents.create.logComplete'))) {
      setLogStreaming(false);
    }
  }, [logStreaming, agent?.creationLog, t]);

  React.useEffect(() => {
    if (!agent) return;
    // Wait for services to load before deciding the default service.
    if (services === undefined) return;
    const stored = activeServiceByAgent[agent.id];
    if (stored !== undefined && stored !== null) return;
    const firstTerminal = services.find((s) => s.type === 'terminal');
    setActiveService(agent.id, firstTerminal ? firstTerminal.name : CONSOLE_SERVICE_ID);
  }, [agent?.id, services, activeServiceByAgent, setActiveService]);

  if (!agentId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm select-none">
        {t('agents.selectAgent')}
      </div>
    );
  }

  if (isLoading || !agent) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  const activeServiceId = activeServiceByAgent[agent.id] ?? null;
  const isConsoleActive = activeServiceId === CONSOLE_SERVICE_ID;
  const isSettingsActive = activeServiceId === SETTINGS_SERVICE_ID;
  const isActivityLogActive = activeServiceId === ACTIVITY_LOG_SERVICE_ID;
  const isContainerLogActive = activeServiceId === CONTAINER_LOG_SERVICE_ID;
  const isLogViewActive = isActivityLogActive || isContainerLogActive;

  const allServices: Array<{ id: string; name: string; type: AgentService['type'] | 'console'; proxyName?: string }> = [
    ...(services ?? []).map((s) => ({ id: s.name, name: s.name, type: s.type, proxyName: s.name })),
    { id: CONSOLE_SERVICE_ID, name: t('agents.console'), type: 'console' },
  ];

  const activeProxyUrl =
    activeServiceId && activeServiceId !== CONSOLE_SERVICE_ID && activeServiceId !== SETTINGS_SERVICE_ID && !isLogViewActive
      ? agentsClient.getAgentServiceProxyUrl(agent.name, activeServiceId)
      : undefined;

  // URL for "open in new tab" — works for both real services (proxy URL) and console (standalone page)
  const newTabUrl =
    activeServiceId === CONSOLE_SERVICE_ID
      ? `/console/${encodeURIComponent(agent.name)}`
      : activeProxyUrl;

  const handleStartRename = () => {
    setEditName(agent.name);
    setNameError(null);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setNameError(t('agents.nameRequired'));
      return;
    }
    if (trimmed === agent.name) {
      setIsEditingName(false);
      return;
    }
    try {
      await renameAgent.mutateAsync({ id: agent.id, name: trimmed });
      setIsEditingName(false);
      setNameError(null);
    } catch (error: unknown) {
      setNameError(error instanceof Error ? error.message : t('common.error'));
    }
  };

  // Build title element (editable or static)
  const titleEl = isEditingName ? (
    <div className="flex items-center gap-1">
      <input
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleSaveName(); }
          if (e.key === 'Escape') { setIsEditingName(false); setNameError(null); }
        }}
        className="w-[200px] max-w-full rounded border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
        autoFocus
      />
      <button
        onClick={handleSaveName}
        disabled={renameAgent.isPending}
        title={t('common.save')}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft"
      >
        {renameAgent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button
        onClick={() => { setIsEditingName(false); setNameError(null); }}
        title={t('common.cancel')}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft"
      >
        <X className="h-4 w-4" />
      </button>
      {nameError && <span className="text-xs text-destructive ml-1">{nameError}</span>}
    </div>
  ) : (
    <div className="flex items-center gap-1.5">
      <h1 className="text-sm font-semibold text-foreground truncate">{agent.name}</h1>
      <button
        onClick={handleStartRename}
        title={t('agents.rename')}
        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-primary-soft"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  // Service chips as a group
  const serviceChips = allServices.length > 0 ? allServices.map((service) => {
    const isActive = activeServiceId === service.id;
    return (
      <button
        key={service.id}
        type="button"
        onClick={() => setActiveService(agent.id, service.id)}
        className={cx(
          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors border',
          isActive
            ? 'border-primary-soft bg-primary/15 text-primary-soft hover:bg-primary/15'
            : 'border-border bg-secondary-item text-muted-foreground hover:border-primary/30 hover:bg-primary/15 hover:text-primary-soft',
        )}
        title={`${service.name} (${service.type})`}
      >
        {service.type === 'terminal' && <SquareTerminal className="h-3 w-3" />}
        {service.type === 'web' && <Globe className="h-3 w-3" />}
        {service.type === 'console' && <SquareTerminal className="h-3 w-3" />}
        {service.name}
      </button>
    );
  }) : [];

  // Action buttons
  const actionButtons: React.ReactNode[] = [
    <ActionButton
      key="open"
      href={newTabUrl ?? undefined}
      disabled={!newTabUrl}
      icon={<SquareArrowOutUpRight className="w-4 h-4" />}
      label={t('agents.openInNewTab')}
      hoverClass="hover:text-primary hover:bg-primary/10"
    />,
    <ActionButton
      key="settings"
      onClick={() => setActiveService(agent.id, SETTINGS_SERVICE_ID)}
      icon={<Settings className="w-4 h-4" />}
      label={t('agents.settings')}
      hoverClass="hover:text-primary-soft hover:bg-primary/15"
      active={isSettingsActive}
    />,
  ];

  if (agent.workspaceId != null) {
    actionButtons.push(
      <ContentHeaderAction
        key="workspace-drawer"
        icon={PanelRight}
        label={t('workspaceFiles.manage')}
        onClick={() => setWorkspaceDrawerOpen(!workspaceDrawerOpen)}
        className={cx(workspaceDrawerOpen && 'text-primary-soft')}
      />,
    );
  }

  const lifecycleActions: React.ReactNode[] = [];
  if (agent.status !== 'running') {
    lifecycleActions.push(
      <ActionButton
        key="start"
        onClick={() => {
          setTransition(agent.id, 'starting');
          startAgent.mutate(agent.id, {
            onSettled: () => setTransition(agent.id, null),
          });
        }}
        loading={transition === 'starting'}
        icon={<Play className="w-4 h-4" />}
        label={t('agents.start')}
        hoverClass="hover:text-primary-soft hover:bg-primary/15"
      />,
    );
  }
  if (agent.status === 'running') {
    lifecycleActions.push(
      <ActionButton
        key="stop"
        onClick={() => {
          setTransition(agent.id, 'stopping');
          stopAgent.mutate(agent.id, {
            onSettled: () => setTransition(agent.id, null),
          });
        }}
        loading={transition === 'stopping'}
        icon={<Square className="w-4 h-4" />}
        label={t('agents.stop')}
        hoverClass="hover:text-amber-600 dark:hover:text-amber-500 hover:bg-amber-500/10"
      />,
    );
  }
  lifecycleActions.push(
    <ActionButton
      key="restart"
      onClick={() => {
        setTransition(agent.id, 'restarting');
        restartAgent.mutate(agent.id, {
          onSettled: () => setTransition(agent.id, null),
        });
      }}
      loading={transition === 'restarting'}
      disabled={
        agent.status !== 'running' ||
        !agent.templateCommands?.some((c) => c.type === 'stop_agent' || c.type === 'start_agent')
      }
      icon={<RotateCw className="w-4 h-4" />}
      label={t('agents.restart')}
      hoverClass="hover:text-primary hover:bg-primary/10"
    />,
  );

  // Build action groups: [view actions] | [lifecycle actions]
  const actionGroups: React.ReactNode[][] = [];
  actionGroups.push(actionButtons);
  actionGroups.push(lifecycleActions);

  const renderMainContent = () => (
    isSettingsActive ? (
      <AgentSettings agent={agent} />
    ) : (
      <div className="h-full p-2">
        {!activeServiceId && (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm bg-background rounded">
            {t('agents.noActiveService')}
          </div>
        )}
        {isConsoleActive && <AgentConsole agentId={agent.id} active={agent.status === 'running'} />}
        {activeProxyUrl && agent.status === 'running' && (
          <IframeService src={activeProxyUrl} title={activeServiceId ?? 'service'} />
        )}
        {activeProxyUrl && agent.status !== 'running' && (
          <div className="h-full flex flex-col items-center justify-center gap-3 bg-background rounded">
            <Power className="h-16 w-16 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t('agents.stoppedMessage')}</p>
          </div>
        )}
      </div>
    )
  );

  if (isLogViewActive) {
    return (
      <AgentLogsView
        agent={agent}
        kind={isContainerLogActive ? 'container' : 'activity'}
        onBack={() => setActiveService(agent.id, CONSOLE_SERVICE_ID)}
      />
    );
  }

  // Deleting — show a clear "removing" state instead of stale settings/card
  // while the DELETE request is in flight (the optimistic list cache already
  // dropped the sidebar card, but this detail view is driven by ['agents', id]).
  if (transition === 'deleting') {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">{t('agents.deleting')}</span>
      </div>
    );
  }

  return (
    <ContentShell
      title={titleEl}
      icon={({ className }) => (
        <TemplateIcon
          icon={agent.templateIcon}
          iconDark={agent.templateIconDark}
          className={className}
        />
      )}
      badges={[
        { label: t(`agents.${agent.status}`), variant: statusBadgeVariant[agent.status] },
      ]}
      actionGroups={actionGroups}
      centerContent={serviceChips.length > 0 ? <div className="flex items-center gap-2">{serviceChips}</div> : undefined}
      noScroll
    >
      {hasWorkspace ? (
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChangedWithSync}
        >
          <ResizablePanel id="main" defaultSize="72" minSize="40">
            <div className="flex flex-col h-full min-w-0">
              <AgentRequests agentId={agent.id} />
              <AgentNotices agentId={agent.id} />
              <div className="flex-1 min-h-0">
                {renderMainContent()}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel
            id="drawer"
            panelRef={drawerPanelRef}
            defaultSize="28"
            minSize="15"
            maxSize="45"
            collapsible
            collapsedSize={0}
          >
            <WorkspaceDrawer
              workspaceId={agent.workspaceId!}
              workspaceName={agent.workspaceName!}
              workspaceSlug={agent.workspaceSlug ?? undefined}
              branch={workspaceInfo?.branch}
              onClose={() => setWorkspaceDrawerOpen(false)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex flex-col h-full">
          <AgentRequests agentId={agent.id} />
          <AgentNotices agentId={agent.id} />
          <div className="flex-1 min-h-0">
            {renderMainContent()}
          </div>
        </div>
      )}
    </ContentShell>
  );
}

/**
 * Wraps a service iframe (ttyd, code-server, etc.) and ensures it measures
 * correctly on first load. Resizes that happen AFTER mount (browser resize,
 * workspace drawer collapse) already propagate natively to cross-origin
 * iframes, so the only broken case is the very first paint: the iframe can
 * mount while the layout is still settling and measure a stale/too-small
 * viewport, then never get corrected because no resize event follows.
 *
 * Trick: briefly shrink the iframe by a fraction of a pixel. Framed apps see
 * a resize event, re-fit their terminal, and the iframe snaps back. No
 * remount, so the service session is preserved.
 */
function IframeService({ src, title }: { src: string; title: string }) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const nudge = React.useCallback(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    frame.style.width = 'calc(100% - 1px)';
    requestAnimationFrame(() => {
      frame.style.width = '100%';
    });
  }, []);

  React.useEffect(() => {
    // Staggered nudges after mount to cover layout settling (drawer animating,
    // panel still sizing). No observer — later resizes are handled natively.
    const t1 = setTimeout(nudge, 120);
    const t2 = setTimeout(nudge, 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [nudge]);

  return (
    <div className="h-full w-full min-w-0 min-h-0">
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        className="h-full w-full rounded bg-white"
        style={{ transition: 'none' }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
