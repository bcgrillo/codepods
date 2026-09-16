import { useTranslation } from 'react-i18next';
import type { AiProvider } from '@codepods/shared-types';
import { BrainCircuit } from 'lucide-react';
import { cx } from '../../utils/cx';
import { SelectableCard } from '../ui/SelectableCard';
import { TemplateIcon } from '../templates/TemplateIcon';

interface AiProviderCardProps {
  provider: AiProvider;
  selected: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

export function AiProviderCard({ provider, selected, onClick, collapsed }: AiProviderCardProps) {
  const { t } = useTranslation();
  const defaultModel = provider.models.find((m) => m.isDefault);
  const disabled = !provider.enabled;

  return (
    <SelectableCard
      selected={selected}
      onClick={onClick}
      collapsed={collapsed}
      disabled={disabled}
      iconBoxTitle={provider.name}
      iconBoxClassName={disabled ? 'bg-background/80' : undefined}
      icon={
        provider.iconUrl ? (
          <TemplateIcon icon={provider.iconUrl} iconDark={provider.iconDarkUrl} className="h-full w-full" />
        ) : (
          <BrainCircuit className={cx(disabled ? 'text-muted-foreground/50' : 'text-foreground')} />
        )
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">{provider.name}</p>
          {provider.isDefault && (
            <span className="flex-shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              {t('aiProviders.defaultProvider')}
            </span>
          )}
          {disabled && (
            <span className="flex-shrink-0 rounded bg-secondary-item px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t('images.disabled')}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {defaultModel ? defaultModel.name : t('aiProviders.noModels')}
        </p>
      </div>
    </SelectableCard>
  );
}