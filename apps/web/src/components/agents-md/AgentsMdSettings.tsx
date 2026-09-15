import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Star, IdCard } from 'lucide-react';
import { useAgentsMdList, useCreateAgentsMd } from '../../hooks/useConfig';
import { AgentsMdDetail } from './AgentsMdDetail';
import { cx } from '../../utils/cx';
import { ContentShell } from '../ContentShell';

export function AgentsMdSettingsSection({
  selectedId,
  onSelect,
}: {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const { data: agentsMdList, isLoading } = useAgentsMdList();
  const create = useCreateAgentsMd();
  const [creating, setCreating] = useState(false);
  const [pendingEditId, setPendingEditId] = useState<number | null>(null);

  const handleNewVersion = async () => {
    setCreating(true);
    try {
      const created = await create.mutateAsync({ alias: t('agentsMd.newVersion'), content: '# AGENTS\n\n' });
      setPendingEditId(created.id);
      onSelect(created.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <ContentShell title={t('agentsMd.title')} icon={IdCard}>
      <div className="absolute inset-0 flex">
        {/* Version list — floating third-level menu, same as agent-settings TOC */}
        <div className="w-64 flex-shrink-0 flex flex-col py-4">
          <div className="px-3 pb-2">
            <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('agentsMd.versions')}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto py-1 px-2">
            {isLoading && (
              <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">{t('common.loading')}</span>
              </div>
            )}
            {agentsMdList?.map((am) => (
              <button
                key={am.id}
                onClick={() => onSelect(am.id)}
                className={cx(
                  'w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors',
                  selectedId === am.id
                    ? 'bg-primary/15 text-primary-soft'
                    : 'text-foreground/70 hover:bg-primary/15 hover:text-primary-soft',
                )}
              >
                <span className="truncate flex-1 min-w-0 text-left">{am.alias}</span>
                {am.isDefault && (
                  <Star className="h-3 w-3 flex-shrink-0 text-primary" />
                )}
              </button>
            ))}

            {/* "+ Create new version" — in the versions menu, opens in edit mode */}
            <button
              onClick={handleNewVersion}
              disabled={creating}
              className={cx(
                'mt-1 w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors border-t border-border/60',
                'text-primary hover:bg-primary/15 hover:text-primary-soft disabled:opacity-50',
              )}
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {t('agentsMd.newVersion')}
            </button>
          </div>
        </div>

        {/* Editor (right) */}
        <div className="flex-1 min-w-0">
          <AgentsMdDetail
            agentsMdId={selectedId}
            openInEdit={pendingEditId !== null && pendingEditId === selectedId}
            onEditConsumed={() => setPendingEditId(null)}
          />
        </div>
      </div>
    </ContentShell>
  );
}