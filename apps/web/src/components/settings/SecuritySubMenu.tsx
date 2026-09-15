import { useTranslation } from 'react-i18next';
import { Container, GitBranch, GlobeLock, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SecuritySection } from '../../store/uiStore';

interface Props {
  section: SecuritySection;
  onSelect: (section: SecuritySection) => void;
  collapsed?: boolean;
}

export function SecuritySubMenu({ section, onSelect, collapsed }: Props) {
  const { t } = useTranslation();

  const items: Array<{ id: SecuritySection; icon: React.ReactNode; label: string }> = [
    { id: 'network', icon: <GlobeLock className="h-5 w-5" />, label: t('security.network') },
    { id: 'credentials', icon: <KeyRound className="h-5 w-5" />, label: t('settings.credentials') },
    { id: 'docker', icon: <Container className="h-5 w-5" />, label: t('settings.docker') },
    { id: 'git', icon: <GitBranch className="h-5 w-5" />, label: t('security.git') },
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