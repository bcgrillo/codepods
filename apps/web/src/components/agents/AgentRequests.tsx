import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Check, X, ShieldQuestion, Globe } from 'lucide-react';
import type { AgentRequest } from '@codepods/shared-types';
import { useAgentRequests, useApproveAgentRequest, useRejectAgentRequest } from '../../hooks/useAgents';

function RequestCard({
  request,
  onApprove,
  onReject,
  onDismiss,
}: {
  request: AgentRequest;
  onApprove: (durationMinutes?: number) => void;
  onReject: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const isPending = request.status === 'pending';
  const host = (request.payload as { host?: string }).host ?? '';

  const statusColor =
    request.status === 'approved' ? 'text-green-600 dark:text-green-400' :
    request.status === 'rejected' ? 'text-destructive' :
    request.status === 'expired' ? 'text-muted-foreground' :
    'text-amber-600 dark:text-amber-400';

  return (
    <div className="flex items-start gap-2 rounded-md bg-amber-500/10 ring-1 ring-amber-500/30 px-2.5 py-1.5">
      <ShieldQuestion className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('requests.accessRequest')}</span>
          <span className={`text-[10px] ${statusColor}`}>
            ({t(`requests.status.${request.status}`)})
          </span>
          <Globe className="h-3 w-3 text-muted-foreground" />
          <code className="text-xs text-foreground font-mono">{host}</code>
          {request.expiresAt && request.status === 'approved' && (
            <span className="text-[10px] text-muted-foreground">
              {t('requests.expiresAt')}: {new Date(request.expiresAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        {request.reason && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{request.reason}</p>
        )}

        {isPending && (
          <div className="flex items-center gap-1 mt-1">
            <button
              type="button"
              onClick={() => onApprove(5)}
              className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 hover:text-green-500 dark:hover:text-green-300 bg-green-600/10 hover:bg-green-600/20 rounded px-1.5 py-0.5 transition-colors"
            >
              <Clock className="h-3 w-3" />
              {t('requests.approve5min')}
            </button>
            <button
              type="button"
              onClick={() => onApprove()}
              className="inline-flex items-center gap-1 text-[10px] text-foreground hover:text-foreground/80 bg-muted hover:bg-muted/80 rounded px-1.5 py-0.5 transition-colors"
            >
              <Check className="h-3 w-3" />
              {t('requests.approvePermanent')}
            </button>
            <button
              type="button"
              onClick={onReject}
              className="inline-flex items-center gap-1 text-[10px] text-destructive hover:text-destructive/80 bg-destructive/10 hover:bg-destructive/20 rounded px-1.5 py-0.5 transition-colors"
            >
              <X className="h-3 w-3" />
              {t('requests.reject')}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex-shrink-0 p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
        title={t('common.dismiss')}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function AgentRequests({ agentId }: { agentId: string }) {
  const { data: requests } = useAgentRequests(agentId);
  const approve = useApproveAgentRequest(agentId);
  const reject = useRejectAgentRequest(agentId);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  if (!requests || requests.length === 0) return null;

  // Show pending first, then recently resolved
  const sorted = [...requests].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Only show pending + recently resolved (last 60s), exclude dismissed
  const now = Date.now();
  const visible = sorted.filter(
    (r) =>
      !dismissedIds.has(r.id) &&
      (r.status === 'pending' || (r.resolvedAt && now - new Date(r.resolvedAt).getTime() < 60_000)),
  );

  if (visible.length === 0) return null;

  const dismiss = (id: number) => setDismissedIds((prev) => new Set(prev).add(id));

  return (
    <div className="px-4 py-1.5 border-b border-border flex-shrink-0 space-y-1">
      {visible.map((r) => (
        <RequestCard
          key={r.id}
          request={r}
          onApprove={(durationMinutes) => approve.mutate({ requestId: r.id, durationMinutes })}
          onReject={() => reject.mutate(r.id)}
          onDismiss={() => dismiss(r.id)}
        />
      ))}
    </div>
  );
}