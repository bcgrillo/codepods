import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GitBranch as GitBranchIcon, Loader2, RefreshCw, DownloadCloud,
  UploadCloud, Inbox, GitCommit as GitCommitIcon, Check,
} from 'lucide-react';
import {
  useGitStatus, useGitBranches, useGitFetch, useGitStash, useGitCommit, useGitSync,
} from '../../hooks/useWorkspaces';
import { inputCls } from '../ui/styles';
import { PrimaryButton, SecondaryButton } from '../ui/buttons';

interface WorkspaceGitPanelProps {
  workspaceId: number;
}

const STATUS_COLORS: Record<string, string> = {
  M: 'text-amber-400',
  A: 'text-emerald-500',
  D: 'text-destructive',
  R: 'text-blue-400',
  C: 'text-blue-400',
  U: 'text-purple-400',
  '??': 'text-muted-foreground',
};

function ChangeRow({ status, file, oldPath }: { status: string; file: string; oldPath?: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className={`w-1.5 text-xs font-mono ${STATUS_COLORS[status] ?? 'text-muted-foreground'}`}>
        {status}
      </span>
      <span className="text-xs text-foreground truncate">
        {oldPath ? `${oldPath} → ${file}` : file}
      </span>
    </div>
  );
}

export function WorkspaceGitPanel({ workspaceId }: WorkspaceGitPanelProps) {
  const { t } = useTranslation();
  const { data: status, isLoading: statusLoading } = useGitStatus(workspaceId);
  const { data: branches } = useGitBranches(workspaceId);
  const gitFetch = useGitFetch();
  const gitStash = useGitStash();
  const gitCommit = useGitCommit();
  const gitSync = useGitSync();

  const [commitMsg, setCommitMsg] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const handleFetch = async () => {
    try {
      await gitFetch.mutateAsync(workspaceId);
      showMsg('success', t('workspaceGit.fetchDone'));
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleStash = async (action: 'push' | 'pop') => {
    try {
      const result = await gitStash.mutateAsync({ id: workspaceId, action });
      showMsg('success', result.message);
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    try {
      await gitCommit.mutateAsync({ id: workspaceId, message: commitMsg.trim() });
      setCommitMsg('');
      showMsg('success', t('workspaceGit.commitDone'));
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleSync = async () => {
    try {
      const result = await gitSync.mutateAsync(workspaceId);
      showMsg('success', result.message);
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : t('common.error'));
    }
  };

  if (statusLoading || !status) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allChanges = [
    ...status.staged,
    ...status.unstaged,
    ...status.untracked,
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Status summary (branch shown in drawer header) */}
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          {status.upstream && (
            <span className="text-xs text-muted-foreground">
              → {status.upstream}
              {status.ahead > 0 && <span className="ml-1 text-emerald-500">↑{status.ahead}</span>}
              {status.behind > 0 && <span className="ml-1 text-amber-400">↓{status.behind}</span>}
            </span>
          )}
          {status.clean ? (
            <span className="ml-auto text-xs text-emerald-500">{t('workspaceGit.clean')}</span>
          ) : (
            <span className="ml-auto text-xs text-amber-400">
              {allChanges.length} {t('workspaceGit.changes')}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2">
        <SecondaryButton onClick={handleFetch} disabled={gitFetch.isPending} className="!py-1 !text-xs">
          {gitFetch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5" />}
          {t('workspaceGit.fetch')}
        </SecondaryButton>
        <SecondaryButton onClick={handleSync} disabled={gitSync.isPending} className="!py-1 !text-xs">
          {gitSync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t('workspaceGit.sync')}
        </SecondaryButton>
        <SecondaryButton onClick={() => handleStash('push')} disabled={gitStash.isPending} className="!py-1 !text-xs">
          <Inbox className="h-3.5 w-3.5" />
          {t('workspaceGit.stashPush')}
        </SecondaryButton>
        <SecondaryButton onClick={() => handleStash('pop')} disabled={gitStash.isPending} className="!py-1 !text-xs">
          <UploadCloud className="h-3.5 w-3.5" />
          {t('workspaceGit.stashPop')}
        </SecondaryButton>
      </div>

      {msg && (
        <div className={`px-3 py-1.5 text-xs ${msg.type === 'error' ? 'text-destructive' : 'text-emerald-500'}`}>
          {msg.text}
        </div>
      )}

      {/* Changes list */}
      <div className="border-b border-border px-3 py-2">
        <h3 className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
          {t('workspaceGit.pendingChanges')}
        </h3>
        {allChanges.length === 0 ? (
          <p className="text-xs text-muted-foreground/50">{t('workspaceGit.noChanges')}</p>
        ) : (
          <div className="space-y-0">
            {status.staged.length > 0 && (
              <>
                <p className="pt-1 text-[11px] text-muted-foreground">{t('workspaceGit.staged')}</p>
                {status.staged.map((c, i) => <ChangeRow key={`s${i}`} status={c.status} file={c.path} oldPath={c.oldPath} />)}
              </>
            )}
            {status.unstaged.length > 0 && (
              <>
                <p className="pt-1 text-[11px] text-muted-foreground">{t('workspaceGit.unstaged')}</p>
                {status.unstaged.map((c, i) => <ChangeRow key={`u${i}`} status={c.status} file={c.path} oldPath={c.oldPath} />)}
              </>
            )}
            {status.untracked.length > 0 && (
              <>
                <p className="pt-1 text-[11px] text-muted-foreground">{t('workspaceGit.untracked')}</p>
                {status.untracked.map((c, i) => <ChangeRow key={`t${i}`} status={c.status} file={c.path} />)}
              </>
            )}
          </div>
        )}
      </div>

      {/* Commit */}
      <div className="border-b border-border px-3 py-2">
        <div className="flex gap-2">
          <input
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder={t('workspaceGit.commitPlaceholder')}
            className={inputCls}
            onKeyDown={(e) => { if (e.key === 'Enter' && commitMsg.trim()) handleCommit(); }}
          />
          <PrimaryButton onClick={handleCommit} disabled={!commitMsg.trim() || gitCommit.isPending} className="!py-1 !px-3">
            {gitCommit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommitIcon className="h-3.5 w-3.5" />}
            {t('workspaceGit.commit')}
          </PrimaryButton>
        </div>
      </div>

      {/* Branches */}
      {branches && (
        <div className="px-3 py-2">
          <h3 className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
            {t('workspaceGit.branches')}
          </h3>
          <div className="space-y-0.5">
            {branches.local.map((b) => (
              <div key={b.name} className="flex items-center gap-2 text-xs">
                {b.current ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <GitBranchIcon className="h-3 w-3 text-muted-foreground/50" />
                )}
                <span className={b.current ? 'text-foreground' : 'text-muted-foreground'}>{b.name}</span>
              </div>
            ))}
            {branches.remote.length > 0 && (
              <>
                <p className="pt-1.5 text-[11px] text-muted-foreground/50">{t('workspaceGit.remoteBranches')}</p>
                {branches.remote.map((b) => (
                  <div key={b.name} className="flex items-center gap-2 text-xs">
                    <GitBranchIcon className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{b.name}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}