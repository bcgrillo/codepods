import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { Credential, GitProviderType } from '@codepods/shared-types';
import { inputCls } from '../ui/styles';
import { Field } from '../ui/Field';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';

type WorkspaceFormType = 'local' | 'remote' | 'new-remote';

function repoNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
    return parts[parts.length - 1] ?? u.hostname;
  } catch {
    const base = url.replace(/\.git$/, '').split('/').pop() ?? url;
    return base;
  }
}

interface InlineWorkspaceFormProps {
  type: WorkspaceFormType;
  hideTypeToggle?: boolean;
  onTypeChange?: (t: WorkspaceFormType) => void;
  remoteUrl: string;
  onRemoteUrlChange: (v: string) => void;
  name: string;
  onNameChange: (v: string) => void;
  nameTouched: boolean;
  credMode: 'existing' | 'new';
  onCredModeChange: (m: 'existing' | 'new') => void;
  credentialId: number | '';
  onCredentialIdChange: (v: number | '') => void;
  credUsername: string;
  onCredUsernameChange: (v: string) => void;
  credToken: string;
  onCredTokenChange: (v: string) => void;
  credentials?: Credential[];
  // new-remote fields
  gitProvider?: GitProviderType;
  onGitProviderChange?: (p: GitProviderType) => void;
  repoName?: string;
  onRepoNameChange?: (v: string) => void;
  repoPrivate?: boolean;
  onRepoPrivateChange?: (v: boolean) => void;
  suggestedName?: string;
}

export function InlineWorkspaceForm(props: InlineWorkspaceFormProps) {
  const { t } = useTranslation();
  const {
    type,
    hideTypeToggle,
    onTypeChange,
    remoteUrl,
    onRemoteUrlChange,
    name,
    onNameChange,
    credMode,
    onCredModeChange,
    credentialId,
    onCredentialIdChange,
    credUsername,
    onCredUsernameChange,
    credToken,
    onCredTokenChange,
    credentials,
    repoName,
    onRepoNameChange,
    repoPrivate,
    onRepoPrivateChange,
    suggestedName,
  } = props;

  const hasCredentials = !!credentials && credentials.length > 0;

  const handleTypeChange = (tp: WorkspaceFormType) => {
    onTypeChange?.(tp);
    if (tp === 'remote' || tp === 'new-remote') {
      onCredModeChange(hasCredentials ? 'existing' : 'new');
    }
  };

  const typeOptions: SegmentedOption<WorkspaceFormType>[] = [
    { value: 'local', label: t('workspaces.local') },
    { value: 'remote', label: t('workspaces.remote') },
    { value: 'new-remote', label: t('workspaces.newRemote') },
  ];

  const needsCredential = type === 'remote' || type === 'new-remote';

  return (
    <div className="space-y-3">
      {/* Type toggle */}
      {!hideTypeToggle && (
        <SegmentedControl
          options={typeOptions}
          value={type}
          onChange={handleTypeChange}
          size="lg"
          aria-label={t('workspaces.title')}
        />
      )}

      {/* Local hint */}
      {type === 'local' && (
        <p className="text-xs text-muted-foreground">{t('workspaces.localHint')}</p>
      )}

      {/* Remote URL (clone existing) */}
      {type === 'remote' && (
        <Field label={t('workspaces.remoteUrl')}>
          <input
            value={remoteUrl}
            onChange={(e) => onRemoteUrlChange(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            className={inputCls}
            autoFocus
          />
        </Field>
      )}

      {/* New-remote: repo name + private checkbox */}
      {type === 'new-remote' && (
        <>
          <p className="text-xs text-muted-foreground">{t('workspaces.newRemoteHint')}</p>
          <Field label={t('workspaces.repoName')}>
            <div className="flex items-center gap-2">
              <label className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded border border-border bg-background px-2.5 py-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={repoPrivate ?? true}
                  onChange={(e) => onRepoPrivateChange?.(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border bg-secondary-item"
                />
                {t('workspaces.repoPrivate')}
              </label>
              <input
                value={repoName ?? ''}
                onChange={(e) => onRepoNameChange?.(e.target.value)}
                placeholder={t('workspaces.repoNamePlaceholder')}
                className={inputCls}
                autoFocus
              />
            </div>
          </Field>
        </>
      )}

      {/* Credential selector (remote + new-remote) */}
      {needsCredential && (
        <Field label={t('workspaces.credential')}>
          <div className="flex gap-2">
            <select
              value={credMode === 'existing' ? credentialId : 'new'}
              disabled={!hasCredentials && credMode === 'existing'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'new') {
                  onCredModeChange('new');
                  onCredentialIdChange('');
                } else {
                  onCredModeChange('existing');
                  onCredentialIdChange(Number(v));
                }
              }}
              className={inputCls}
            >
              {!hasCredentials && (
                <option value="new">{t('workspaces.useNewCredential')}</option>
              )}
              {hasCredentials && (
                <>
                  <option value="new">+ {t('workspaces.newCredential')}</option>
                  {credentials?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({c.host})
                    </option>
                  ))}
                </>
              )}
            </select>
            <button
              type="button"
              onClick={() => {
                onCredModeChange('new');
                onCredentialIdChange('');
              }}
              title={t('workspaces.newCredential')}
              className={`flex flex-shrink-0 items-center rounded border px-3 ${
                credMode === 'new'
                  ? 'border-primary bg-primary/10 text-primary-soft'
                  : 'border-border text-muted-foreground hover:bg-secondary-item'
              }`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </Field>
      )}

      {/* New credential fields */}
      {needsCredential && credMode === 'new' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('workspaces.credentialUsername')}>
            <input
              value={credUsername}
              onChange={(e) => onCredUsernameChange(e.target.value)}
              placeholder="user"
              className={inputCls}
            />
          </Field>
          <Field label={t('workspaces.credentialPassword')}>
            <input
              type="password"
              value={credToken}
              onChange={(e) => onCredTokenChange(e.target.value)}
              placeholder="ghp_..."
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {/* Internal name (auto-suggested) */}
      <Field label={t('workspaces.name')}>
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={
              type === 'remote'
                ? repoNameFromUrl(remoteUrl)
                : type === 'new-remote'
                  ? (repoName?.split('/').pop() || 'my-project')
                  : 'my-workspace'
            }
            className={inputCls}
          />
          {suggestedName && (
            <button
              type="button"
              onClick={() => onNameChange(suggestedName)}
              className="shrink-0 whitespace-nowrap rounded border border-border px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {t('workspaces.useSuggestedName', { name: suggestedName })}
            </button>
          )}
        </div>
      </Field>
    </div>
  );
}
