import { useTranslation } from 'react-i18next';
import { NewItemCard } from '../ui/NewItemCard';

interface NewAiProviderCardProps {
  onClick: () => void;
  collapsed?: boolean;
}

export function NewAiProviderCard({ onClick, collapsed }: NewAiProviderCardProps) {
  const { t } = useTranslation();

  return <NewItemCard onClick={onClick} collapsed={collapsed} label={t('aiProviders.newProvider')} />;
}