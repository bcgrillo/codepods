import { useTranslation } from 'react-i18next';
import { NewItemCard } from '../ui/NewItemCard';

interface NewAgentCardProps {
  onClick: () => void;
  collapsed?: boolean;
}

export function NewAgentCard({ onClick, collapsed }: NewAgentCardProps) {
  const { t } = useTranslation();

  return <NewItemCard onClick={onClick} collapsed={collapsed} label={t('agents.newAgent')} />;
}
