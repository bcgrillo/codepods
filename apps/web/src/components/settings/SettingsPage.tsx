import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, RefreshCw, AlertCircle, Settings, Package } from 'lucide-react';
import {
  useConfig,
  useUpdateConfig,
  useReloadConfig,
} from '../../hooks/useConfig';
import { useSetupStatus } from '../../hooks/useAgents';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { useUiStore } from '../../store/uiStore';
import { CentralReposSettingsSection } from './CentralReposSettings';
import { AboutPage } from './AboutPage';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { SectionHeader } from '../ui/SectionHeader';
import { SaveButton } from '../ui/SaveButton';
import type { CodepodsConfigDto } from '@codepods/shared-types';
import { cx } from '../../utils/cx';
import { TextField } from '../ui/TextField';
import { FormContainer } from '../ui/FormContainer';
import { ContentShell } from '../ContentShell';
import { ContentHeaderAction } from '../ContentHeader';

export function SettingsPage() {
  const { t } = useTranslation();
  const { settingsSection } = useUiStore();
  const { data: config, isLoading: configLoading } = useConfig();
  const updateConfig = useUpdateConfig();
  const reloadConfig = useReloadConfig();
  const { data: setupStatus } = useSetupStatus();

  const [edit, setEdit] = useState<Partial<CodepodsConfigDto>>({});
  const [saved, setSaved] = useState(false);

  const dirty = Object.keys(edit).length > 0;
  useUnsavedChangesGuard(dirty);

  if (settingsSection === 'repositories') {
    return <CentralReposSettingsSection />;
  }

  if (settingsSection === 'about') {
    return <AboutPage />;
  }

  if (configLoading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const merged = { ...config, ...edit };

  const handleSave = () => {
    updateConfig.mutate(edit, {
      onSuccess: () => {
        setEdit({});
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  };

  const handleReload = () => {
    if (dirty && !window.confirm(t('settings.unsavedRefreshWarning'))) return;
    reloadConfig.mutate();
  };

  if (settingsSection === 'dependencies') {
    return (
      <ContentShell
        title={t('settings.dependencies')}
        icon={Package}
        actions={[
          <ContentHeaderAction
            key="reload"
            icon={RefreshCw}
            label={t('settings.reload')}
            onClick={handleReload}
            className={cx(reloadConfig.isPending && 'text-primary-soft')}
          />,
        ]}
      >
        <FormContainer className="space-y-6 py-4">
          <div className="space-y-2">
            {setupStatus?.checks.map((check) => (
              <div
                key={check.name}
                className={cx(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border',
                  check.status === 'ok'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-destructive/30 bg-destructive/5',
                )}
              >
                {check.status === 'ok' ? (
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{check.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{check.message}</p>
                </div>
                {check.actionUrl && (
                  <a
                    href={check.actionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:text-primary-soft"
                  >
                    {t('setup.install')}
                  </a>
                )}
              </div>
            ))}
          </div>
        </FormContainer>
      </ContentShell>
    );
  }

  // General settings
  return (
    <ContentShell
      title={t('settings.general')}
      icon={Settings}
      actions={[
        <ContentHeaderAction
          key="reload"
          icon={RefreshCw}
          label={t('settings.reload')}
          onClick={handleReload}
          className={cx(reloadConfig.isPending && 'text-primary-soft')}
        />,
        <SaveButton
          key="save"
          onSave={handleSave}
          dirty={dirty}
          saving={updateConfig.isPending}
          saved={saved}
          saveLabel={t('common.save')}
          savedLabel={t('settings.saved')}
        />,
      ]}
    >
      <FormContainer className="space-y-6 py-4">
        {/* Config fields */}
        <section className="space-y-4">
          <TextField
            label={t('settings.dataDir')}
            value={merged.dataDir}
            onChange={(v) => setEdit({ ...edit, dataDir: v })}
          />
          <p className="text-xs text-muted-foreground -mt-2">
            {t('settings.dataDirHint', { dir: merged.dataDir })}
          </p>
          <TextField
            label={t('settings.port')}
            value={String(merged.port)}
            onChange={(v) => setEdit({ ...edit, port: Number(v) || 0 })}
          />
          <TextField
            label={t('settings.publicUrl')}
            value={merged.publicUrl}
            onChange={(v) => setEdit({ ...edit, publicUrl: v })}
          />
          <TextField
            label={t('settings.corsOrigin')}
            value={String(merged.corsOrigin)}
            onChange={(v) => setEdit({ ...edit, corsOrigin: v === 'true' ? true : v === 'false' ? false : v })}
          />

          {/* Toggles using ToggleSwitch component */}
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-foreground">{t('settings.swaggerEnabled')}</span>
            <ToggleSwitch
              checked={merged.swaggerEnabled}
              onChange={() => setEdit({ ...edit, swaggerEnabled: !merged.swaggerEnabled })}
            />
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-foreground">{t('settings.buildKit')}</span>
            <ToggleSwitch
              checked={merged.buildKit}
              onChange={() => setEdit({ ...edit, buildKit: !merged.buildKit })}
            />
          </div>
        </section>

        {/* TLS / HTTPS */}
        <section className="space-y-4 pt-2 border-t border-border">
          <div>
            <SectionHeader title={t('settings.tls')} />
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.tlsHint')}</p>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-foreground">{t('settings.tlsEnabled')}</span>
            <ToggleSwitch
              checked={merged.tlsEnabled}
              onChange={() => setEdit({ ...edit, tlsEnabled: !merged.tlsEnabled })}
            />
          </div>
          <TextField
            label={t('settings.tlsCertPath')}
            value={merged.tlsCertPath}
            onChange={(v) => setEdit({ ...edit, tlsCertPath: v })}
          />
          <TextField
            label={t('settings.tlsKeyPath')}
            value={merged.tlsKeyPath}
            onChange={(v) => setEdit({ ...edit, tlsKeyPath: v })}
          />
          <TextField
            label={t('settings.tlsPort')}
            value={String(merged.tlsPort)}
            onChange={(v) => setEdit({ ...edit, tlsPort: Number(v) || 0 })}
          />
          <p className="text-xs text-amber-600 dark:text-amber-500/80">{t('settings.tlsRestartHint')}</p>
        </section>

        {/* Config file path */}
        <section>
          <p className="text-xs text-muted-foreground">
            {t('settings.configPath')}: <code className="text-foreground">~/.codepods/config.json</code>
          </p>
        </section>
      </FormContainer>
    </ContentShell>
  );
}