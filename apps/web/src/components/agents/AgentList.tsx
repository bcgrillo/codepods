import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Play, Square, RotateCw, SquareTerminal, Globe } from 'lucide-react';
import type { Agent } from '@codepods/shared-types';
import { useAgents, useReorderAgents, useStartAgent, useStopAgent, useRestartAgent, agentsClient } from '../../hooks/useAgents';
import { useUiStore } from '../../store/uiStore';
import { useAgentTransitionStore } from '../../store/agentTransitionStore';
import { TemplateIcon } from '../templates/TemplateIcon';
import { SecondaryList, type SecondaryItem, type StatusType, type ContextMenuAction } from '../SecondaryList';
import { sortWithForcedOrder } from '../../utils/sorting';

function statusType(agent: Agent, transition: string | undefined): StatusType | undefined {
  if (transition === 'starting' || transition === 'stopping' || transition === 'restarting' || transition === 'deleting') return 'warning';
  switch (agent.status) {
    case 'running':
      return 'active';
    case 'paused':
      return 'warning';
    case 'exited':
      return 'error';
    default:
      return 'inactive';
  }
}

function isDisconnected(agent: Agent, transition: string | undefined): boolean {
  if (transition) return false;
  return agent.status === 'stopped' || agent.status === 'exited' || agent.status === 'unknown';
}

export function AgentList({ collapsed }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: agents, isLoading, isError } = useAgents();
  const { selectedAgentId } = useUiStore();
  const reorderAgents = useReorderAgents();
  const startAgent = useStartAgent();
  const stopAgent = useStopAgent();
  const restartAgent = useRestartAgent();
  const transitions = useAgentTransitionStore((s) => s.transitions);
  const setTransition = useAgentTransitionStore((s) => s.setTransition);
  const location = useLocation();
  const creating = location.pathname.endsWith('/agents/new');

  const items = useMemo<SecondaryItem[]>(() => {
    if (!agents) return [];
    return sortWithForcedOrder(agents)
      .filter((agent) => transitions[agent.id] !== 'deleting')
      .map((agent) => {
        const transition = transitions[agent.id];
        return {
          id: agent.id,
          icon: (
            <TemplateIcon
              icon={agent.templateIcon}
              iconDark={agent.templateIconDark}
              className="h-[60%] w-[60%]"
            />
          ),
          label: agent.name,
          secondary: transition ? t(`agents.${transition}`) : agent.templateName ?? agent.image,
          status: statusType(agent, transition),
          pinned: (agent.sortOrder ?? 0) > 0,
          groupId: isDisconnected(agent, transition) ? 'disconnected' : undefined,
        };
      });
  }, [agents, transitions, t]);

  const pinnedIds = useMemo(() => items.filter((i) => i.pinned).map((i) => i.id), [items]);

  const handleSelect = (id: string) => {
    const agent = agents?.find((a) => a.id === id);
    if (agent) navigate(`/agents/${encodeURIComponent(agent.name)}`);
  };

  const handleReorder = (newPinnedIds: string[]) => {
    reorderAgents.mutate(newPinnedIds);
  };

  const handlePin = (id: string, pinned: boolean) => {
    const next = pinned ? [...pinnedIds, id] : pinnedIds.filter((x) => x !== id);
    reorderAgents.mutate(next);
  };

  const contextMenuActions = (item: SecondaryItem): ContextMenuAction[] => {
    const agent = agents?.find((a) => a.id === item.id);
    if (!agent) return [];

    const openNewTabActions: ContextMenuAction[] = [
      // One item per real service (terminal/web) followed by Console (last).
      // Main click opens the service WITH the CodePods frame (in-app route);
      // the right-side arrow icon opens the raw proxy URL WITHOUT the frame.
      ...(agent.services ?? []).map((service) => ({
        id: `open-${service.name}`,
        label: t('agents.openServiceInNewTab', { service: service.name }),
        icon:
          service.type === 'web' ? <Globe className="h-4 w-4" /> : <SquareTerminal className="h-4 w-4" />,
        href: `/agents/${encodeURIComponent(agent.name)}/${encodeURIComponent(service.name)}`,
        externalHref: agentsClient.getAgentServiceProxyUrl(agent.name, service.name),
        externalTitle: t('agents.openServiceExternal', { service: service.name }),
      })),
      {
        id: 'open-console',
        label: t('agents.openServiceInNewTab', { service: t('agents.console') }),
        icon: <SquareTerminal className="h-4 w-4" />,
        href: `/agents/${encodeURIComponent(agent.name)}`,
        externalHref: `/console/${encodeURIComponent(agent.name)}`,
        externalTitle: t('agents.openServiceExternal', { service: t('agents.console') }),
      },
    ];

    const lifecycleActions: ContextMenuAction[] = [];
    if (agent.status !== 'running') {
      lifecycleActions.push({
        id: 'start',
        label: t('agents.start'),
        icon: <Play className="h-4 w-4" />,
        variant: 'success',
        disabled: Boolean(transitions[agent.id]),
        onClick: () => {
          setTransition(agent.id, 'starting');
          startAgent.mutate(agent.id, { onSettled: () => setTransition(agent.id, null) });
        },
      });
    }
    if (agent.status === 'running') {
      lifecycleActions.push({
        id: 'stop',
        label: t('agents.stop'),
        icon: <Square className="h-4 w-4" />,
        variant: 'warning',
        disabled: Boolean(transitions[agent.id]),
        onClick: () => {
          setTransition(agent.id, 'stopping');
          stopAgent.mutate(agent.id, { onSettled: () => setTransition(agent.id, null) });
        },
      });
    }
    lifecycleActions.push({
      id: 'restart',
      label: t('agents.restart'),
      icon: <RotateCw className="h-4 w-4" />,
      variant: 'default',
      disabled:
        agent.status !== 'running' ||
        !agent.templateCommands?.some((c) => c.type === 'stop_agent' || c.type === 'start_agent'),
      onClick: () => {
        setTransition(agent.id, 'restarting');
        restartAgent.mutate(agent.id, { onSettled: () => setTransition(agent.id, null) });
      },
    });

    return [
      ...openNewTabActions,
      { id: '__separator__', label: '' },
      ...lifecycleActions,
    ];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {!collapsed && <span className="text-sm">{t('common.loading')}</span>}
      </div>
    );
  }

  if (isError) {
    return <p className="px-4 py-4 text-sm text-destructive">{t('common.error')}</p>;
  }

  return (
    <SecondaryList
      items={items}
      groups={[{ id: 'disconnected', label: t('agents.disconnected'), defaultCollapsed: true }]}
      selectedId={creating ? '__new__' : selectedAgentId}
      newItemLabel={t('agents.newAgent')}
      onSelect={handleSelect}
      onPin={handlePin}
      onReorder={handleReorder}
      onNew={() => navigate('/agents/new')}
      contextMenuActions={contextMenuActions}
      collapsed={collapsed}
    />
  );
}
