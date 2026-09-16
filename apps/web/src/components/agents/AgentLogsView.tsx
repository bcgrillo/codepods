import { useTranslation } from 'react-i18next';
import { ScrollText } from 'lucide-react';
import type { Agent } from '@codepods/shared-types';
import { ContentShell } from '../ContentShell';
import { AgentLogPanel } from './AgentLogPanel';

export type AgentLogKind = 'activity' | 'container';

interface AgentLogsViewProps {
  agent: Agent;
  kind: AgentLogKind;
  onBack: () => void;
}

/**
 * Full-content log viewer for an agent. Renders either the CodePods activity
 * log (creation/agent lifecycle entries stored on the agent) or the live
 * container log (docker logs). Opened from the agent settings, deep-linkable
 * via /agents/:name/logs and /agents/:name/container-logs.
 */
export function AgentLogsView({ agent, kind, onBack }: AgentLogsViewProps) {
  const { t } = useTranslation();
  const isContainer = kind === 'container';

  return (
    <ContentShell
      title={t(isContainer ? 'agents.logs.containerTitle' : 'agents.logs.activityTitle')}
      icon={ScrollText}
      subtitle={agent.name}
      showBack
      onBack={onBack}
      noScroll
    >
      <div className="flex h-full flex-col p-3">
        <AgentLogPanel agent={agent} kind={kind} />
      </div>
    </ContentShell>
  );
}
