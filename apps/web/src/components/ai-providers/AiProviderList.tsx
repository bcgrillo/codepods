import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, BrainCircuit } from 'lucide-react';
import { useAiProviders, useReorderAiProviders } from '../../hooks/useAiProviders';
import { useUiStore } from '../../store/uiStore';
import { SecondaryList, type SecondaryItem } from '../SecondaryList';
import { TemplateIcon } from '../templates/TemplateIcon';
import { sortWithForcedOrder } from '../../utils/sorting';

function ProviderIcon(iconUrl: string, iconDarkUrl?: string) {
  return function Icon({ className }: { className?: string }) {
    return <TemplateIcon icon={iconUrl} iconDark={iconDarkUrl} className={className} />;
  };
}

export function AiProviderList({ collapsed }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: providers, isLoading, isError } = useAiProviders();
  const { selectedAiProviderId } = useUiStore();
  const reorderProviders = useReorderAiProviders();
  const location = useLocation();
  const creating = location.pathname.endsWith('/ai-providers/new');

  const items = useMemo<SecondaryItem[]>(() => {
    if (!providers) return [];
    return sortWithForcedOrder(providers).map((p) => {
      const defaultModel = (p.models ?? []).find((m) => m.isDefault);
      return {
        id: String(p.id),
        icon: p.iconUrl
          ? ProviderIcon(p.iconUrl, p.iconDarkUrl ?? undefined)
          : BrainCircuit,
        label: p.name,
        secondary: defaultModel ? defaultModel.name : t('aiProviders.noModels'),
        badge: p.isDefault ? `⭐ ${t('aiProviders.defaultProvider')}` : undefined,
        badgeVariant: p.isDefault ? 'gold' : undefined,
        pinned: (p.sortOrder ?? 0) > 0,
        groupId: !p.enabled ? 'disabled' : undefined,
      };
    });
  }, [providers, t]);

  const pinnedIds = useMemo(() => items.filter((i) => i.pinned).map((i) => i.id), [items]);

  const handleSelect = (id: string) => {
    const p = providers?.find((x) => String(x.id) === id);
    if (p) navigate(`/ai-providers/${encodeURIComponent(p.slug)}`);
  };

  const handleReorder = (newPinnedIds: string[]) => {
    reorderProviders.mutate(newPinnedIds.map(Number));
  };

  const handlePin = (id: string, pinned: boolean) => {
    const next = pinned ? [...pinnedIds, id] : pinnedIds.filter((x) => x !== id);
    reorderProviders.mutate(next.map(Number));
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
      selectedId={creating ? '__new__' : selectedAiProviderId != null ? String(selectedAiProviderId) : null}
      newItemLabel={t('aiProviders.newProvider')}
      onSelect={handleSelect}
      onPin={handlePin}
      onReorder={handleReorder}
      onNew={() => navigate('/ai-providers/new')}
      collapsed={collapsed}
    />
  );
}
