import React from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import type { Agent } from '@codepods/shared-types';
import { ContentHeaderAction } from '../ContentHeader';
import { useAgentContainerLogs } from '../../hooks/useAgents';
import type { AgentLogKind } from './AgentLogsView';

interface AgentLogPanelProps {
  agent: Agent;
  kind: AgentLogKind;
  /** Whether to show the refresh action in the panel toolbar. */
  showRefresh?: boolean;
}

/**
 * Reusable log body for an agent — either the CodePods activity log
 * (creation/agent lifecycle entries stored on the agent) or the live container
 * log (docker logs). Used in-place inside agent settings (filling the content
 * space) and inside the full-content log viewer.
 */
export function AgentLogPanel({ agent, kind, showRefresh = true }: AgentLogPanelProps) {
  const { t } = useTranslation();
  const isContainer = kind === 'container';
  const { data, isLoading, isFetching, error, refetch } = useAgentContainerLogs(agent.id, isContainer);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const rawText = isContainer ? (data?.logs ?? '') : (agent.creationLog ?? '');
  const errorText = error instanceof Error ? error.message : error ? t('common.error') : null;

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rawText]);

  const hasContent = rawText.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {showRefresh && isContainer && (
        <div className="flex shrink-0 items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{t('agents.logs.containerTitle')}</span>
          <ContentHeaderAction
            key="refresh"
            icon={RefreshCw}
            label={t('settings.reload')}
            onClick={() => refetch()}
            className={isFetching ? 'text-primary-soft' : undefined}
          />
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto rounded border border-border bg-background p-3 font-mono text-[11px] text-foreground"
      >
        {isContainer && isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">{t('common.loading')}</span>
          </div>
        ) : errorText ? (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{errorText}</span>
          </div>
        ) : !hasContent ? (
          <p className="text-muted-foreground/50">
            {t(isContainer ? 'agents.logs.containerEmpty' : 'agents.create.creationLogEmpty')}
          </p>
        ) : (
          rawText.split('\n').map((line, i) => (
            <p
              key={i}
              className={
                line.startsWith('→')
                  ? 'text-primary'
                  : line.startsWith('  ')
                    ? 'text-muted-foreground'
                    : ''
              }
            >
              {line || '\u00A0'}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
