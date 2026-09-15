import { useTranslation } from 'react-i18next';
import { KeyRound, Monitor, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserSection } from '../../store/uiStore';

interface Props {
  section: UserSection;
  onSelect: (section: UserSection) => void;
  collapsed?: boolean;
}

export function UserSubMenu({ section, onSelect, collapsed }: Props) {
  const { t } = useTranslation();

  const items: Array<{ id: UserSection; icon: React.ReactNode; label: string; destructive?: boolean }> = [
    { id: 'password', icon: <KeyRound className="h-5 w-5" />, label: t('user.changePassword') },
    { id: 'devices', icon: <Monitor className="h-5 w-5" />, label: t('user.devices') },
    { id: 'logout', icon: <LogOut className="h-5 w-5" />, label: t('nav.logout'), destructive: true },
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
              isActive && (item.destructive ? 'bg-destructive/15 text-destructive' : 'nav-item-active'),
              item.destructive && !isActive && 'text-destructive/70 hover:bg-destructive/10 hover:text-destructive',
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