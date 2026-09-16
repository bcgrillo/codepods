import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Pencil, Star, Trash2 } from 'lucide-react';
import {
  useAgentsMd,
  useRemoveAgentsMd,
  useSetDefaultAgentsMd,
  useUpdateAgentsMd,
} from '../../hooks/useConfig';

interface Props {
  agentsMdId: number | null;
  /** When true, the next loaded version opens directly in edit mode. */
  openInEdit?: boolean;
  /** Called after openInEdit has been consumed. */
  onEditConsumed?: () => void;
}

export function AgentsMdDetail({ agentsMdId, openInEdit = false, onEditConsumed }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useAgentsMd(agentsMdId);
  const update = useUpdateAgentsMd();
  const remove = useRemoveAgentsMd();
  const setDefault = useSetDefaultAgentsMd();

  const [alias, setAlias] = useState('');
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (data) {
      setAlias(data.alias);
      setContent(data.content);
      setIsEditing(openInEdit);
      if (openInEdit) onEditConsumed?.();
    }
  }, [data, openInEdit, onEditConsumed]);

  if (!agentsMdId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <p className="text-sm">{t('agentsMd.selectPrompt')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSave = () => {
    if (!agentsMdId) return;
    update.mutate({ id: agentsMdId, dto: { alias, content } });
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (!agentsMdId) return;
    remove.mutate(agentsMdId);
  };

  const handleSetDefault = () => {
    if (!agentsMdId) return;
    setDefault.mutate(agentsMdId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? alias : data?.alias}
          </h2>
          {data?.isDefault && (
            <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary flex items-center gap-1">
              <Star className="w-3 h-3" />
              {t('agentsMd.default')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={update.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
              >
                {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t('common.save')}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  if (data) {
                    setAlias(data.alias);
                    setContent(data.content);
                  }
                }}
                className="px-3 py-1.5 text-sm rounded bg-secondary-item hover:bg-secondary-item/80 text-foreground transition-colors"
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <>
              {!data?.isDefault && (
                <button
                  onClick={handleSetDefault}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-secondary-item hover:bg-secondary-item/80 text-foreground transition-colors"
                >
                  <Star className="w-4 h-4" />
                  {t('agentsMd.setDefault')}
                </button>
              )}
              <button
                onClick={() => setIsEditing(true)}
                className="btn-icon"
                title={t('common.edit')}
                aria-label={t('common.edit')}
              >
                <Pencil className="w-4 h-4" />
              </button>
              {!data?.isDefault && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 overflow-hidden p-6">
        {isEditing ? (
          <div className="flex flex-col h-full gap-3">
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded bg-background border border-input text-foreground focus:outline-none focus:border-primary"
              placeholder={t('agentsMd.aliasPlaceholder')}
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 w-full px-4 py-3 text-sm font-mono rounded bg-background border border-input text-foreground focus:outline-none focus:border-primary resize-none overflow-auto"
              placeholder={t('agentsMd.contentPlaceholder')}
            />
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <pre className="text-sm font-mono text-foreground whitespace-pre-wrap">
              {data?.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}