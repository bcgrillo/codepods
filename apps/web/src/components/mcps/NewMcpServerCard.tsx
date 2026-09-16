import { useTranslation } from 'react-i18next';
import { NewItemCard } from '../ui/NewItemCard';

interface NewMcpServerCardProps {
  onClick: () => void;
  collapsed?: boolean;
}

export function NewMcpServerCard({ onClick, collapsed }: NewMcpServerCardProps) {
  const { t } = useTranslation();
  return <NewItemCard onClick={onClick} collapsed={collapsed} label={t('mcps.newServer')} />;
}