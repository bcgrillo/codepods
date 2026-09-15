import { ChevronLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface ContentHeaderProps {
  title: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  subtitle?: React.ReactNode;
  badges?: { label: string; variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }[];
  showBack?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode[];
  actionGroups?: React.ReactNode[][];
  centerContent?: React.ReactNode;
  className?: string;
}

export function ContentHeader({
  title,
  icon: TitleIcon,
  subtitle,
  badges,
  showBack,
  onBack,
  actions,
  actionGroups,
  centerContent,
  className,
}: ContentHeaderProps) {
  const groups = actionGroups ?? (actions?.length ? [actions] : []);

  return (
    <header
      className={cn(
        'relative flex h-12 items-center justify-between px-4 border-b border-border shrink-0',
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className="btn-icon"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {TitleIcon && <TitleIcon className="h-5 w-5 text-primary-soft shrink-0" />}
            <h1 className="font-semibold truncate">{title}</h1>
            {subtitle && (
              <span className="text-xs text-muted-foreground truncate hidden sm:inline">{subtitle}</span>
            )}
            {badges && badges.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                {badges.map((badge, i) => (
                  <Badge key={i} variant={badge.variant ?? 'secondary'} className="text-[10px] px-1.5 py-0">
                    {badge.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {centerContent && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
          {centerContent}
        </div>
      )}

      {groups.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {groups.map((group, groupIndex) => (
            <div key={groupIndex} className="flex items-center gap-0.5">
              {group.map((action, i) => (
                <div key={i} className="flex items-center">
                  {action}
                </div>
              ))}
              {groupIndex < groups.length - 1 && (
                <Separator orientation="vertical" className="h-5 mx-1" />
              )}
            </div>
          ))}
        </div>
      )}
    </header>
  );
}

export function ContentHeaderAction({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('btn-icon', className)}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}