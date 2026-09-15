import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { McpServer } from '@codepods/shared-types';
import { useMcpServers, useReorderMcpServers } from '../../hooks/useMcpServers';
import { useUiStore } from '../../store/uiStore';
import { McpIcon } from '../icons/McpIcon';
import { SecondaryList, type SecondaryItem } from '../SecondaryList';
import { sortWithForcedOrder } from '../../utils/sorting';

export function McpServerList({ collapsed }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: servers, isLoading, isError } = useMcpServers();
  const { selectedMcpServerId } = useUiStore();
  const reorderMcpServers = useReorderMcpServers();
  const location = useLocation();
  const creating = location.pathname.endsWith('/mcps/new');

  const items = useMemo<SecondaryItem[]>(() => {
    if (!servers) return [];
    // Exclude built-in MCPs — shown as a bottom button in SecondaryPanel
    return sortWithForcedOrder(servers.filter((s) => !s.builtIn)).map((s: McpServer) => ({
      id: String(s.id),
      icon: <McpIcon className="h-4 w-4" />,
      label: s.name,
      secondary: s.url ?? s.slug,
      badge: s.builtIn ? t('mcps.builtIn') : undefined,
      pinned: (s.sortOrder ?? 0) > 0,
      groupId: !s.enabled ? 'disabled' : undefined,
    }));
  }, [servers, t]);

  const pinnedIds = useMemo(() => items.filter((i) => i.pinned).map((i) => i.id), [items]);

  const handleSelect = (id: string) => {
    const s = servers?.find((x) => String(x.id) === id);
    if (s) navigate(`/mcps/${encodeURIComponent(s.slug)}`);
  };

  const handleReorder = (newPinnedIds: string[]) => {
    reorderMcpServers.mutate(newPinnedIds.map((id) => Number(id)));
  };

  const handlePin = (id: string, pinned: boolean) => {
    const next = pinned ? [...pinnedIds, id] : pinnedIds.filter((x) => x !== id);
    reorderMcpServers.mutate(next.map((x) => Number(x)));
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
      groups={[{ id: 'disabled', label: t('common.disabled'), defaultCollapsed: true }]}
      selectedId={creating ? '__new__' : selectedMcpServerId != null ? String(selectedMcpServerId) : null}
      newItemLabel={t('mcps.newServer')}
      onSelect={handleSelect}
      onPin={handlePin}
      onReorder={handleReorder}
      onNew={() => navigate('/mcps/new')}
      collapsed={collapsed}
    />
  );
}
