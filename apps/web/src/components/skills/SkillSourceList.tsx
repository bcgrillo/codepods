import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, HardDrive, FileBadge, BookMarked } from 'lucide-react';
import type { SkillSource } from '@codepods/shared-types';
import { useSkillSources, useReorderSkillSources } from '../../hooks/useSkills';
import { useUiStore } from '../../store/uiStore';
import { SecondaryList, type SecondaryItem } from '../SecondaryList';
import { sortWithForcedOrder } from '../../utils/sorting';

function sourceIcon(source: SkillSource) {
  if (source.type === 'local') return HardDrive;
  if (source.type === 'skill') return FileBadge;
  return BookMarked;
}

export function SkillSourceList({ collapsed }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: sources, isLoading, isError } = useSkillSources();
  const { selectedSkillSourceId } = useUiStore();
  const reorderSkillSources = useReorderSkillSources();
  const location = useLocation();
  const creating = location.pathname.endsWith('/skills/new');

  const items = useMemo<SecondaryItem[]>(() => {
    if (!sources) return [];
    // Local source is shown as a bottom button in SecondaryPanel
    return sortWithForcedOrder(sources.filter((s) => s.type !== 'local')).map((s) => ({
      id: String(s.id),
      icon: sourceIcon(s),
      label: s.name,
      secondary: `${s.skillCount} ${t('skills.skillsUnit')}`,
      badge: s.builtIn ? t('skills.builtIn') : undefined,
      pinned: (s.sortOrder ?? 0) > 0,
      groupId: !s.enabled ? 'disabled' : undefined,
    }));
  }, [sources, t]);

  const pinnedIds = useMemo(() => items.filter((i) => i.pinned).map((i) => i.id), [items]);

  const handleSelect = (id: string) => {
    navigate(`/skills/${id}`);
  };

  const handleReorder = (newPinnedIds: string[]) => {
    reorderSkillSources.mutate(newPinnedIds.map((id) => Number(id)));
  };

  const handlePin = (id: string, pinned: boolean) => {
    const next = pinned ? [...pinnedIds, id] : pinnedIds.filter((x) => x !== id);
    reorderSkillSources.mutate(next.map((x) => Number(x)));
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

  const selectedId = creating
    ? '__new__'
    : selectedSkillSourceId != null
      ? String(selectedSkillSourceId)
      : null;

  return (
    <SecondaryList
      items={items}
      groups={[{ id: 'disabled', label: t('common.disabled'), defaultCollapsed: true }]}
      selectedId={selectedId}
      newItemLabel={t('skills.newSource')}
      onSelect={handleSelect}
      onPin={handlePin}
      onReorder={handleReorder}
      onNew={() => navigate('/skills/new')}
      collapsed={collapsed}
    />
  );
}
