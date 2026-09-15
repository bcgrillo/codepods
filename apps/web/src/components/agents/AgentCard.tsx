import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Agent } from '@codepods/shared-types';
import { TemplateIcon } from '../templates/TemplateIcon';
import { cx } from '../../utils/cx';
import { useAgentTransitionStore } from '../../store/agentTransitionStore';
import { SelectableCard } from '../ui/SelectableCard';

interface AgentCardProps {
  agent: Agent;
  selected: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

const statusRing: Record<string, { ring: string; tint: 'white' | 'zinc' }> = {
  running: { ring: 'ring-2 ring-emerald-500/60', tint: 'white' },
  stopped: { ring: 'ring-2 ring-destructive/60', tint: 'zinc' },
  exited: { ring: 'ring-2 ring-destructive/60', tint: 'zinc' },
  paused: { ring: 'ring-2 ring-amber-500/60', tint: 'white' },
  unknown: { ring: 'ring-2 ring-muted-foreground/60', tint: 'zinc' },
};

export function AgentCard({ agent, selected, onClick, collapsed }: AgentCardProps) {
  const { t } = useTranslation();
  const transition = useAgentTransitionStore((s) => s.transitions[agent.id]);
  const setTransition = useAgentTransitionStore((s) => s.setTransition);
  const status = statusRing[agent.status] ?? statusRing.unknown;
  const prevStatusRef = useRef(agent.status);

  // Auto-clear stale transitions based on the polled agent status (every 5s).
  // If the HTTP mutation is slow or its onSettled doesn't fire (e.g. the stop
  // command hangs), the polled status will still reflect the real state and
  // we clear the transition so the sidebar doesn't stay stuck.
  useEffect(() => {
    if (!transition) {
      prevStatusRef.current = agent.status;
      return;
    }

    if (
      (transition === 'stopping' && agent.status !== 'running') ||
      (transition === 'starting' && agent.status === 'running') ||
      (transition === 'restarting' &&
        agent.status === 'running' &&
        prevStatusRef.current !== 'running') ||
      (transition === 'recreating' &&
        agent.status === 'running' &&
        prevStatusRef.current !== 'running')
    ) {
      setTransition(agent.id, null);
    }

    prevStatusRef.current = agent.status;
  }, [agent.status, transition, agent.id, setTransition]);

  const isTransitioning = transition === 'starting' || transition === 'stopping' || transition === 'restarting' || transition === 'recreating';

  return (
    <SelectableCard
      selected={selected}
      onClick={onClick}
      collapsed={collapsed}
      iconBoxTitle={agent.name}
      iconBoxClassName={cx(
        'relative',
        isTransitioning ? 'ring-2 ring-amber-500 animate-pulse' : status.ring,
      )}
      icon={
        <TemplateIcon
          icon={agent.templateIcon}
          iconDark={agent.templateIconDark}
          className="h-[60%] w-[60%]"
          tint={status.tint}
        />
      }
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
        {isTransitioning ? (
          <p className="text-xs text-amber-600 dark:text-amber-500 truncate">{t(`agents.${transition}`)}</p>
        ) : (
          <p className="text-xs text-muted-foreground truncate">{agent.templateName ?? agent.image}</p>
        )}
      </div>
    </SelectableCard>
  );
}
