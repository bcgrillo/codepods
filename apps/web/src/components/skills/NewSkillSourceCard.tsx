import { useTranslation } from 'react-i18next';
import { NewItemCard } from '../ui/NewItemCard';

interface NewSkillSourceCardProps {
  onClick: () => void;
  collapsed?: boolean;
}

export function NewSkillSourceCard({ onClick, collapsed }: NewSkillSourceCardProps) {
  const { t } = useTranslation();
  return <NewItemCard onClick={onClick} collapsed={collapsed} label={t('skills.newSource')} />;
}