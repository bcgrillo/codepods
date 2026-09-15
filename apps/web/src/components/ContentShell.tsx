import { ContentHeader } from '@/components/ContentHeader';
import { cn } from '@/lib/utils';

export interface ContentShellProps {
  title: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  subtitle?: React.ReactNode;
  badges?: { label: string; variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' }[];
  showBack?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode[];
  actionGroups?: React.ReactNode[][];
  centerContent?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Disable the default scrollable wrapper so children manage their own overflow */
  noScroll?: boolean;
}

export function ContentShell({
  title,
  icon,
  subtitle,
  badges,
  showBack,
  onBack,
  actions,
  actionGroups,
  centerContent,
  children,
  footer,
  noScroll,
}: ContentShellProps) {
  return (
    <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
      <ContentHeader
        title={title}
        icon={icon}
        subtitle={subtitle}
        badges={badges}
        showBack={showBack}
        onBack={onBack}
        actions={actions}
        actionGroups={actionGroups}
        centerContent={centerContent}
      />
      <div className={cn('flex-1 relative min-h-0', !noScroll ? 'overflow-auto' : 'overflow-hidden')}>{children}</div>
      {footer && (
        <footer className="shrink-0 border-t border-border px-4 py-2 flex items-center justify-between bg-panel-background">
          {footer}
        </footer>
      )}
    </main>
  );
}
