import React from 'react';
import { useTranslation } from 'react-i18next';
import { Info, AlertTriangle, AlertOctagon, X, Copy, Check } from 'lucide-react';
import type { AgentNotice, AgentNoticeSeverity } from '@codepods/shared-types';
import { useAgentNotices, useDismissAgentNotice } from '../../hooks/useAgents';

const severityStyles: Record<AgentNoticeSeverity, { ring: string; bg: string; text: string; icon: React.ReactNode }> = {
  info: {
    ring: 'ring-blue-500/30',
    bg: 'bg-blue-500/10',
    text: 'text-blue-300',
    icon: <Info className="h-4 w-4 flex-shrink-0" />,
  },
  warning: {
    ring: 'ring-yellow-500/30',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-300',
    icon: <AlertTriangle className="h-4 w-4 flex-shrink-0" />,
  },
  error: {
    ring: 'ring-red-500/30',
    bg: 'bg-red-500/10',
    text: 'text-red-300',
    icon: <AlertOctagon className="h-4 w-4 flex-shrink-0" />,
  },
};

function NoticeCard({ notice, onDismiss }: { notice: AgentNotice; onDismiss: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = React.useState(false);
  const s = severityStyles[notice.severity];

  const handleCopy = () => {
    if (notice.actionText) {
      navigator.clipboard.writeText(notice.actionText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`flex items-start gap-2 rounded-lg ${s.bg} ring-1 ${s.ring} px-3 py-2`}>
      <span className={s.text + ' mt-0.5'}>{s.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${s.text}`}>{notice.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{notice.message}</p>
        {notice.actionLabel && notice.actionText && (
          <button
            type="button"
            onClick={handleCopy}
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-foreground hover:text-white bg-secondary-item hover:bg-secondary-item rounded px-2 py-1 transition-colors"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? t('common.copied') : notice.actionLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title={t('common.dismiss')}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AgentNotices({ agentId }: { agentId: string }) {
  const { data: notices } = useAgentNotices(agentId);
  const dismiss = useDismissAgentNotice(agentId);

  if (!notices || notices.length === 0) return null;

  return (
    <div className="px-4 py-2 border-b border-border flex-shrink-0 space-y-2">
      {notices.map((n) => (
        <NoticeCard key={n.id} notice={n} onDismiss={() => dismiss.mutate(n.id)} />
      ))}
    </div>
  );
}