import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, GitBranch, ShieldAlert } from 'lucide-react';
import { useConfig, useUpdateConfig, useReloadConfig } from '../../hooks/useConfig';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { useUiStore } from '../../store/uiStore';
import { DockerSettingsSection } from './DockerSettings';
import { NetworkSecuritySettingsSection } from './NetworkSecuritySettings';
import { CredentialsSettingsSection } from './CredentialsSettings';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { SectionHeader } from '../ui/SectionHeader';
import { SaveButton } from '../ui/SaveButton';
import type { CodepodsConfigDto, GitSecurityConfig } from '@codepods/shared-types';
import { cx } from '../../utils/cx';
import { TextField } from '../ui/TextField';
import { FormContainer } from '../ui/FormContainer';
import { ContentShell } from '../ContentShell';
import { ContentHeaderAction } from '../ContentHeader';

export function SecurityPage() {
  const { securitySection } = useUiStore();

  if (securitySection === 'network') {
    return <NetworkSecuritySettingsSection />;
  }

  if (securitySection === 'credentials') {
    return <CredentialsSettingsSection />;
  }

  if (securitySection === 'docker') {
    return <DockerSettingsSection />;
  }

  if (securitySection === 'git') {
    return <GitSettingsSection />;
  }

  // Fallback (shouldn't happen)
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Git security section — default author identity + command whitelist + git proxy restrictions
// ---------------------------------------------------------------------------
function GitSettingsSection() {
  const { t } = useTranslation();
  const { data: config, isLoading: configLoading } = useConfig();
  const updateConfig = useUpdateConfig();
  const reloadConfig = useReloadConfig();

  const [edit, setEdit] = useState<Partial<CodepodsConfigDto>>({});
  const [gitSecEdit, setGitSecEdit] = useState<Partial<GitSecurityConfig>>({});
  const [protectedBranchesDraft, setProtectedBranchesDraft] = useState<string | null>(null);
  const [commandWhitelistDraft, setCommandWhitelistDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = Object.keys(edit).length > 0 || Object.keys(gitSecEdit).length > 0 || protectedBranchesDraft !== null || commandWhitelistDraft !== null;
  useUnsavedChangesGuard(dirty);

  if (configLoading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const merged = { ...config, ...edit };
  const gitSec: GitSecurityConfig = { ...config.gitSecurity, ...gitSecEdit };
  const handleSave = () => {
    const payload: Partial<CodepodsConfigDto> = { ...edit };
    const gitSecMerge: GitSecurityConfig = { ...config.gitSecurity, ...gitSecEdit };
    if (protectedBranchesDraft !== null) {
      gitSecMerge.protectedBranches = protectedBranchesDraft.split('\n').map((b) => b.trim()).filter(Boolean);
    }
    if (commandWhitelistDraft !== null) {
      gitSecMerge.commandWhitelist = commandWhitelistDraft.split('\n').map((c) => c.trim()).filter(Boolean);
    }
    if (Object.keys(gitSecEdit).length > 0 || protectedBranchesDraft !== null || commandWhitelistDraft !== null) {
      payload.gitSecurity = gitSecMerge;
    }
    if (Object.keys(payload).length === 0) return;
    updateConfig.mutate(payload, {
      onSuccess: () => {
        setEdit({});
        setGitSecEdit({});
        setProtectedBranchesDraft(null);
        setCommandWhitelistDraft(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  };

  const handleReload = () => {
    if (dirty && !window.confirm(t('settings.unsavedRefreshWarning'))) return;
    setEdit({});
    setGitSecEdit({});
    setProtectedBranchesDraft(null);
    setCommandWhitelistDraft(null);
    setSaved(false);
    reloadConfig.mutate();
  };

  const setGitSec = <K extends keyof GitSecurityConfig>(key: K, value: GitSecurityConfig[K]) =>
    setGitSecEdit({ ...gitSecEdit, [key]: value });

  return (
    <ContentShell
      title={t('security.git')}
      icon={GitBranch}
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
        {/* Default git identity */}
        <section className="space-y-4">
          <div>
            <SectionHeader title={t('settings.gitIdentity')} />
            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.gitIdentityHint')}</p>
          </div>
          <TextField
            label={t('settings.gitUserName')}
            value={merged.gitUserName}
            onChange={(v) => setEdit({ ...edit, gitUserName: v })}
          />
          <TextField
            label={t('settings.gitUserEmail')}
            value={merged.gitUserEmail}
            onChange={(v) => setEdit({ ...edit, gitUserEmail: v })}
          />
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-foreground">{t('settings.useGenericGitIdentity')}</span>
            <ToggleSwitch
              checked={merged.useGenericGitIdentity}
              onChange={() => setEdit({ ...edit, useGenericGitIdentity: !merged.useGenericGitIdentity })}
            />
          </div>
        </section>

        {/* Git proxy security */}
        <section className="space-y-4 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-500/70" />
            <SectionHeader title={t('security.gitSecurity')} />
          </div>
          <p className="text-xs text-muted-foreground">{t('security.gitSecurityHint')}</p>

          {/* Reuse main repo credentials */}
          <div className="flex items-center justify-between py-2">
            <div className="min-w-0 pr-4">
              <span className="text-sm text-foreground">{t('security.reuseMainRepoCredentials')}</span>
              <p className="text-xs text-muted-foreground mt-0.5">{t('security.reuseMainRepoCredentialsHint')}</p>
            </div>
            <ToggleSwitch
              checked={gitSec.reuseMainRepoCredentials}
              onChange={() => setGitSec('reuseMainRepoCredentials', !gitSec.reuseMainRepoCredentials)}
            />
          </div>

          {/* Block global config */}
          <div className="flex items-center justify-between py-2">
            <div className="min-w-0 pr-4">
              <span className="text-sm text-foreground">{t('security.blockGlobalConfig')}</span>
              <p className="text-xs text-muted-foreground mt-0.5">{t('security.blockGlobalConfigHint')}</p>
              <p className="text-xs text-amber-600 dark:text-amber-500/80 mt-1">{t('security.blockGlobalConfigWarning')}</p>
            </div>
            <ToggleSwitch
              checked={gitSec.blockGlobalConfig}
              onChange={() => setGitSec('blockGlobalConfig', !gitSec.blockGlobalConfig)}
            />
          </div>

          {/* Block force-push */}
          <div className="flex items-center justify-between py-2">
            <div className="min-w-0 pr-4">
              <span className="text-sm text-foreground">{t('security.blockForcePush')}</span>
              <p className="text-xs text-muted-foreground mt-0.5">{t('security.blockForcePushHint')}</p>
            </div>
            <ToggleSwitch
              checked={gitSec.blockForcePush}
              onChange={() => setGitSec('blockForcePush', !gitSec.blockForcePush)}
            />
          </div>

          {/* Block remote management */}
          <div className="flex items-center justify-between py-2">
            <div className="min-w-0 pr-4">
              <span className="text-sm text-foreground">{t('security.blockRemoteManagement')}</span>
              <p className="text-xs text-muted-foreground mt-0.5">{t('security.blockRemoteManagementHint')}</p>
            </div>
            <ToggleSwitch
              checked={gitSec.blockRemoteManagement}
              onChange={() => setGitSec('blockRemoteManagement', !gitSec.blockRemoteManagement)}
            />
          </div>

          {/* Protected branches */}
          <div className="space-y-2 py-2">
            <div>
              <span className="text-sm text-foreground">{t('security.protectedBranches')}</span>
              <p className="text-xs text-muted-foreground mt-0.5">{t('security.protectedBranchesHint')}</p>
            </div>
            <textarea
              className="w-full rounded bg-background border border-input px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-primary resize-y"
              rows={3}
              value={protectedBranchesDraft !== null ? protectedBranchesDraft : gitSec.protectedBranches.join('\n')}
              onChange={(e) => setProtectedBranchesDraft(e.target.value)}
              onBlur={() => {
                if (protectedBranchesDraft !== null) {
                  setGitSec('protectedBranches', protectedBranchesDraft.split('\n').map((b) => b.trim()).filter(Boolean));
                }
              }}
            />
          </div>
        </section>

        {/* Command whitelist */}
        <section className="space-y-4 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-500/70" />
            <SectionHeader title={t('security.gitWhitelist')} />
          </div>
          <p className="text-xs text-muted-foreground">{t('security.gitWhitelistHint')}</p>
          <textarea
            className="w-full rounded bg-background border border-input px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-primary resize-y"
            rows={10}
            value={commandWhitelistDraft !== null ? commandWhitelistDraft : gitSec.commandWhitelist.join('\n')}
            onChange={(e) => setCommandWhitelistDraft(e.target.value)}
            onBlur={() => {
              if (commandWhitelistDraft !== null) {
                setGitSec('commandWhitelist', commandWhitelistDraft.split('\n').map((c) => c.trim()).filter(Boolean));
              }
            }}
          />
        </section>
      </FormContainer>
    </ContentShell>
  );
}