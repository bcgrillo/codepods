import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, FolderGit2 } from 'lucide-react';
import { useWorkspaces, useReorderWorkspaces } from '../../hooks/useWorkspaces';
import { useAgents } from '../../hooks/useAgents';
import { useUiStore } from '../../store/uiStore';
import { SecondaryList, type SecondaryItem } from '../SecondaryList';
import { sortWithForcedOrder } from '../../utils/sorting';

export function WorkspaceList({ collapsed }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: workspaces, isLoading, isError } = useWorkspaces();
  const { data: agents } = useAgents();
  const { selectedWorkspaceId } = useUiStore();
  const reorderWorkspaces = useReorderWorkspaces();
  const location = useLocation();
  const creating = location.pathname.endsWith('/workspaces/new');

  const items = useMemo<SecondaryItem[]>(() => {
    if (!workspaces) return [];
    const sorted = sortWithForcedOrder(workspaces);
    const agentsByWs = new Map<number, { status: string }>();
    for (const a of agents ?? []) {
      if (a.workspaceId != null) agentsByWs.set(a.workspaceId, { status: a.status });
    }
    const offStatuses = new Set(['stopped', 'exited', 'unknown']);
    return sorted.map((ws) => {
      const linked = agentsByWs.get(ws.id);
      let groupId: string | undefined;
      if (!linked) {
        groupId = 'unused';
      } else if (offStatuses.has(linked.status)) {
        groupId = 'disconnected';
      }
      return {
        id: String(ws.id),
        icon: FolderGit2,
        label: ws.name,
        secondary: ws.type === 'remote' ? ws.remoteUrl ?? ws.slug : ws.slug,
        badge: ws.branch ?? undefined,
        pinned: (ws.sortOrder ?? 0) > 0,
        groupId,
      };
    });
  }, [workspaces, agents]);

  const pinnedIds = useMemo(() => items.filter((i) => i.pinned).map((i) => i.id), [items]);

  const handleSelect = (id: string) => {
    const ws = workspaces?.find((x) => String(x.id) === id);
    if (ws) navigate(`/workspaces/${encodeURIComponent(ws.slug)}`);
  };

  const handleReorder = (newPinnedIds: string[]) => {
    reorderWorkspaces.mutate(newPinnedIds.map(Number));
  };

  const handlePin = (id: string, pinned: boolean) => {
    const next = pinned ? [...pinnedIds, id] : pinnedIds.filter((x) => x !== id);
    reorderWorkspaces.mutate(next.map(Number));
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
      groups={[
        { id: 'disconnected', label: t('workspaces.disconnected'), defaultCollapsed: true },
        { id: 'unused', label: t('workspaces.sinUso'), defaultCollapsed: true },
      ]}
      selectedId={creating ? '__new__' : selectedWorkspaceId != null ? String(selectedWorkspaceId) : null}
      newItemLabel={t('workspaces.newWorkspace')}
      onSelect={handleSelect}
      onPin={handlePin}
      onReorder={handleReorder}
      onNew={() => navigate('/workspaces/new')}
      collapsed={collapsed}
    />
  );
}
