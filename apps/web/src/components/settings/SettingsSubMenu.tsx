import { useTranslation } from 'react-i18next';
import { Sliders, PackageCheck, GitFork, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SettingsSection } from '../../store/uiStore';

interface Props {
  section: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  collapsed?: boolean;
}

export function SettingsSubMenu({ section, onSelect, collapsed }: Props) {
  const { t } = useTranslation();

  const items: Array<{ id: SettingsSection; icon: React.ReactNode; label: string }> = [
    { id: 'general', icon: <Sliders className="h-5 w-5" />, label: t('settings.general') },
    { id: 'dependencies', icon: <PackageCheck className="h-5 w-5" />, label: t('settings.dependencies') },
    { id: 'repositories', icon: <GitFork className="h-5 w-5" />, label: t('repositories.title') },
    { id: 'about', icon: <Info className="h-5 w-5" />, label: t('settings.about') },
  ];

  return (
    <div className="px-2 py-3 space-y-1">
      {items.map((item) => {
        const isActive = section === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              'nav-item',
              collapsed && 'justify-center px-0',
              isActive && 'nav-item-active',
            )}
            aria-current={isActive ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
          >
            <span className="shrink-0">{item.icon}</span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        );
      })}
    </div>
  );
}