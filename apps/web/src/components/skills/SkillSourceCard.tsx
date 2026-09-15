import { useTranslation } from 'react-i18next';
import type { SkillSource } from '@codepods/shared-types';
import { BookMarked, FileBadge, HardDrive } from 'lucide-react';
import { cx } from '../../utils/cx';
import { SelectableCard } from '../ui/SelectableCard';

interface SkillSourceCardProps {
  source: SkillSource;
  selected: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

export function SkillSourceCard({ source, selected, onClick, collapsed }: SkillSourceCardProps) {
  const { t } = useTranslation();
  const disabled = !source.enabled;

  const icon =
    source.type === 'local' ? (
      <HardDrive className={cx('h-5 w-5', disabled ? 'text-muted-foreground/50' : 'text-foreground')} />
    ) : source.type === 'skill' ? (
      <FileBadge className={cx('h-5 w-5', disabled ? 'text-muted-foreground/50' : 'text-foreground')} />
    ) : (
      <BookMarked className={cx('h-5 w-5', disabled ? 'text-muted-foreground/50' : 'text-foreground')} />
    );

  return (
    <SelectableCard
      selected={selected}
      onClick={onClick}
      collapsed={collapsed}
      disabled={disabled}
      iconBoxTitle={source.name}
      iconBoxClassName={disabled ? 'bg-background/80' : undefined}
      icon={icon}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">{source.name}</p>
          {source.builtIn && (
            <span className="flex-shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {t('skills.builtIn')}
            </span>
          )}
          {disabled && (
            <span className="flex-shrink-0 rounded bg-secondary-item px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t('common.disabled')}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {source.type === 'local'
            ? t('skills.localSource')
            : `${source.skillCount} ${t('skills.skillsUnit')}`}
        </p>
      </div>
    </SelectableCard>
  );
}