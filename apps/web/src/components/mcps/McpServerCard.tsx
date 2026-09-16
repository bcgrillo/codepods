import { useTranslation } from 'react-i18next';
import type { McpServer } from '@codepods/shared-types';
import { cx } from '../../utils/cx';
import { McpIcon } from '../icons/McpIcon';
import { SelectableCard } from '../ui/SelectableCard';

interface McpServerCardProps {
  server: McpServer;
  selected: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

export function McpServerCard({ server, selected, onClick, collapsed }: McpServerCardProps) {
  const { t } = useTranslation();
  const disabled = !server.enabled;

  return (
    <SelectableCard
      selected={selected}
      onClick={onClick}
      collapsed={collapsed}
      disabled={disabled}
      iconBoxTitle={server.name}
      iconBoxClassName={disabled ? 'bg-background/80' : undefined}
      icon={<McpIcon className={cx('h-5 w-5', disabled ? 'text-muted-foreground/50' : 'text-foreground')} />}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">{server.name}</p>
          {server.builtIn && (
            <span className="flex-shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {t('mcps.builtIn')}
            </span>
          )}
          {server.connectAllAgents && (
            <span className="flex-shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {t('mcps.connectAllAgents')}
            </span>
          )}
          {disabled && (
            <span className="flex-shrink-0 rounded bg-secondary-item px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t('common.disabled')}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {server.builtIn ? t('mcps.codepodsBuiltin') : server.url ?? server.slug}
        </p>
      </div>
    </SelectableCard>
  );
}