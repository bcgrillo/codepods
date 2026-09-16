import { RefreshCw } from 'lucide-react';
import { SaveButton } from './SaveButton';
import { ContentShell } from '../ContentShell';
import { ContentHeaderAction } from '../ContentHeader';
import { cx } from '../../utils/cx';
import type { ReactNode } from 'react';

interface SettingsToolbarProps {
  title: string;
  dirty: boolean;
  saved: boolean;
  saving: boolean;
  reloadPending: boolean;
  onSave: () => void;
  onReload: () => void;
  saveLabel: string;
  savedLabel: string;
  reloadLabel: string;
  /** Confirmation text shown before reloading when there are unsaved changes. */
  reloadDirtyConfirm?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: ReactNode;
}

/**
 * Shared settings page shell: ContentShell header with reload + save actions.
 * Used by the Docker, Network security, Git security, and Credentials
 * settings sections so they share the same action bar.
 */
export function SettingsToolbar({
  title,
  dirty,
  saved,
  saving,
  reloadPending,
  onSave,
  onReload,
  saveLabel,
  savedLabel,
  reloadLabel,
  reloadDirtyConfirm,
  icon,
  children,
}: SettingsToolbarProps) {
  const handleReload = () => {
    if (dirty && reloadDirtyConfirm && !window.confirm(reloadDirtyConfirm)) return;
    onReload();
  };

  return (
    <ContentShell
      title={title}
      icon={icon}
      actions={[
        <ContentHeaderAction
          key="reload"
          icon={RefreshCw}
          label={reloadLabel}
          onClick={handleReload}
          className={cx(reloadPending && 'text-primary-soft')}
        />,
        <SaveButton
          key="save"
          onSave={onSave}
          dirty={dirty}
          saving={saving}
          saved={saved}
          saveLabel={saveLabel}
          savedLabel={savedLabel}
        />,
      ]}
    >
      {children}
    </ContentShell>
  );
}