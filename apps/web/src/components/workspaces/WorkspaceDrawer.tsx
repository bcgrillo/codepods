import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, FolderTree, GitBranch, FolderGit2 } from 'lucide-react';
import { WorkspaceFileManager } from './WorkspaceFileManager';
import { WorkspaceGitPanel } from './WorkspaceGitPanel';
import { cn } from '@/lib/utils';

interface WorkspaceDrawerProps {
  workspaceId: number;
  workspaceName: string;
  workspaceSlug?: string;
  branch?: string | null;
  onClose: () => void;
}

export function WorkspaceDrawer({ workspaceId, workspaceName, workspaceSlug, branch, onClose }: WorkspaceDrawerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'files' | 'git'>('files');

  return (
    <div className="flex flex-col h-full border-l border-border bg-panel-background overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-1 px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FolderGit2 className="h-4 w-4 text-primary" />
            <span>{t('agents.workspace')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => workspaceSlug && navigate(`/workspaces/${encodeURIComponent(workspaceSlug)}`)}
            className="text-left text-xs font-medium text-primary hover:text-primary-soft hover:underline truncate w-fit max-w-full"
            title={workspaceName}
          >
            {workspaceName}
          </button>
          {branch && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <GitBranch className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{branch}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-3 py-1.5 shrink-0">
        <button
          onClick={() => setTab('files')}
          className={cn(
            'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors',
            tab === 'files' ? 'bg-primary/15 text-primary-soft' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <FolderTree className="h-3.5 w-3.5" />
          {t('workspaceFiles.tabFiles')}
        </button>
        <button
          onClick={() => setTab('git')}
          className={cn(
            'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors',
            tab === 'git' ? 'bg-primary/15 text-primary-soft' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <GitBranch className="h-3.5 w-3.5" />
          {t('workspaceFiles.tabGit')}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {tab === 'files' ? (
          <WorkspaceFileManager workspaceId={workspaceId} />
        ) : (
          <WorkspaceGitPanel workspaceId={workspaceId} />
        )}
      </div>
    </div>
  );
}