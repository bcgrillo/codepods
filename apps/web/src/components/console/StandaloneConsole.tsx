import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAgents } from '../../hooks/useAgents';
import { AgentConsole } from './AgentConsole';

export function StandaloneConsole() {
  const { t } = useTranslation();
  const { agentName } = useParams<{ agentName: string }>();
  const { data: agents, isLoading } = useAgents();

  const agent = agents?.find((a) => a.name === decodeURIComponent(agentName ?? ''));

  if (isLoading || !agents) {
    return (
      <div className="h-screen flex items-center justify-center gap-2 text-muted-foreground bg-[#141414]">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground bg-[#141414]">
        <span className="text-sm">{t('agents.selectAgent')}</span>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#141414] p-2">
      <AgentConsole agentId={agent.id} active={agent.status === 'running'} />
    </div>
  );
}