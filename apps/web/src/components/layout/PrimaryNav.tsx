import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  BrainCircuit,
  ChevronLeft,
  FolderGit2,
  GraduationCap,
  Moon,
  Settings,
  Shield,
  Sun,
  SunMoon,
  User,
} from 'lucide-react';
import type { ComponentType, HTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { McpIcon } from '../icons/McpIcon';
import { CodepodsLogo } from '../icons/CodepodsLogo';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUiStore, type ActiveView } from '../../store/uiStore';
import { useThemeStore } from '../../store/themeStore';
import { cn } from '@/lib/utils';

interface NavEntry {
  icon: ComponentType<{ className?: string }>;
  labelKey: string;
  view: ActiveView;
  path: string;
}

const navItems: NavEntry[] = [
  { icon: Bot, labelKey: 'nav.agents', view: 'agents', path: '/agents' },
  { icon: BrainCircuit, labelKey: 'nav.aiProviders', view: 'ai-providers', path: '/ai-providers' },
  { icon: McpIcon, labelKey: 'nav.mcps', view: 'mcps', path: '/mcps' },
  { icon: GraduationCap, labelKey: 'nav.skills', view: 'skills', path: '/skills' },
  { icon: FolderGit2, labelKey: 'nav.workspaces', view: 'workspaces', path: '/workspaces' },
  { icon: Shield, labelKey: 'nav.security', view: 'security', path: '/security' },
];

const LogoButton = forwardRef<HTMLButtonElement, { expanded?: boolean; onClick?: () => void } & HTMLAttributes<HTMLButtonElement>>(
  function LogoButton({ expanded, onClick, ...rest }, ref) {
    const { t } = useTranslation();
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        {...rest}
      className={cn(
        'inline-flex items-center gap-2 rounded-md transition-colors',
        expanded ? 'px-2 py-1.5 hover:bg-primary/10' : 'justify-center p-1.5 btn-icon',
      )}
      aria-label={t('nav.codepods')}
    >
      <CodepodsLogo className="h-6 w-6 text-primary-soft" />
      {expanded && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight">{t('nav.codepods')}</span>
          <span className="block truncate text-xs text-muted-foreground leading-tight">
            {t('common.codepodDefault')}
          </span>
        </span>
      )}
    </button>
  );
  },
);

export function PrimaryNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { primaryNavExpanded, activeView, togglePrimaryNav, setActiveView } = useUiStore();

  const go = (view: ActiveView, path: string) => {
    setActiveView(view);
    navigate(path);
  };

  // Sub-sections that should still highlight their parent in the primary nav
  const parentView: Partial<Record<ActiveView, ActiveView>> = {
    templates: 'agents',
    dashboard: 'agents',
    'managed-apis': 'mcps',
  };
  const navActiveView = parentView[activeView] ?? activeView;

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <aside
        className={cn(
          'hidden md:flex flex-col h-full rounded-xl border border-border bg-panel-background text-card-foreground shadow-sm transition-all duration-200 shrink-0',
          primaryNavExpanded ? 'w-48' : 'w-14',
        )}
      >
        <div className={cn(
          'flex h-12 items-center border-b border-border shrink-0',
          primaryNavExpanded ? 'justify-between px-2' : 'justify-center px-0',
        )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <LogoButton expanded={primaryNavExpanded} onClick={primaryNavExpanded ? undefined : togglePrimaryNav} />
            </TooltipTrigger>
            {!primaryNavExpanded && <TooltipContent side="right">{t('nav.codepods')}</TooltipContent>}
          </Tooltip>
          {primaryNavExpanded && (
            <button
              type="button"
              onClick={togglePrimaryNav}
              className="btn-icon"
              aria-label={primaryNavExpanded ? t('nav.collapseSidebar') : t('nav.expandSidebar')}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {navItems.map((item) => {
            const isActive = navActiveView === item.view;
            const Icon = item.icon;
            const button = (
              <button
                key={item.view}
                type="button"
                onClick={() => go(item.view, item.path)}
                className={cn('nav-item', !primaryNavExpanded && 'justify-center px-0', isActive && 'nav-item-active')}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {primaryNavExpanded && <span className="truncate">{t(item.labelKey)}</span>}
              </button>
            );
            return primaryNavExpanded ? (
              button
            ) : (
              <Tooltip key={item.view}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="flex flex-col gap-1 border-t border-border p-2 shrink-0">
          <ThemeModeItem expanded={primaryNavExpanded} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => go('settings', '/settings')}
                className={cn(
                  'nav-item',
                  !primaryNavExpanded && 'justify-center px-0',
                  activeView === 'settings' && 'nav-item-active',
                )}
                aria-current={activeView === 'settings' ? 'page' : undefined}
              >
                <Settings className="h-5 w-5 shrink-0" />
                {primaryNavExpanded && <span className="truncate">{t('nav.settings')}</span>}
              </button>
            </TooltipTrigger>
            {!primaryNavExpanded && <TooltipContent side="right">{t('nav.settings')}</TooltipContent>}
          </Tooltip>
          <div className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => go('user', '/user')}
                  className={cn(
                    'nav-item',
                    !primaryNavExpanded && 'justify-center px-0',
                    activeView === 'user' && 'nav-item-active',
                  )}
                  aria-current={activeView === 'user' ? 'page' : undefined}
                >
                  <User className="h-5 w-5 shrink-0" />
                  {primaryNavExpanded && <span className="truncate">{t('nav.profile')}</span>}
                </button>
              </TooltipTrigger>
              {!primaryNavExpanded && <TooltipContent side="right">{t('nav.profile')}</TooltipContent>}
            </Tooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function ThemeModeItem({ expanded }: { expanded: boolean }) {
  const { t } = useTranslation();
  const { mode, cycleMode } = useThemeStore();
  const icon =
    mode === 'dark' ? <Moon className="h-5 w-5" /> : mode === 'light' ? <Sun className="h-5 w-5" /> : <SunMoon className="h-5 w-5" />;
  const label = mode === 'dark' ? t('nav.themeDark') : mode === 'light' ? t('nav.themeLight') : t('nav.themeAuto');
  const button = (
    <button
      onClick={cycleMode}
      className={cn('nav-item', !expanded && 'justify-center px-0')}
      aria-label={t('nav.themeMode', { mode: label })}
    >
      <span className="shrink-0">{icon}</span>
      {expanded && <span className="truncate">{label}</span>}
    </button>
  );
  if (expanded) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{t('nav.themeMode', { mode: label })}</TooltipContent>
    </Tooltip>
  );
}
