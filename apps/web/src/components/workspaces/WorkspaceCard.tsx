import type { Workspace } from '@codepods/shared-types';
import { FolderGit2 } from 'lucide-react';
import { SelectableCard } from '../ui/SelectableCard';

interface WorkspaceCardProps {
  workspace: Workspace;
  selected: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

export function WorkspaceCard({ workspace, selected, onClick, collapsed }: WorkspaceCardProps) {
  return (
    <SelectableCard
      selected={selected}
      onClick={onClick}
      collapsed={collapsed}
      iconBoxTitle={workspace.name}
      icon={<FolderGit2 className="h-4 w-4 text-foreground" />}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{workspace.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {workspace.type === 'remote' ? workspace.remoteUrl ?? workspace.slug : workspace.slug}
        </p>
      </div>
      {workspace.branch && (
        <span className="flex-shrink-0 rounded bg-secondary-item px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {workspace.branch}
        </span>
      )}
    </SelectableCard>
  );
}