import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  Copy,
  FolderGit2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
  Zap,
  GitBranch,
  Tag as TagIcon,
  Clock,
  GitCommit,
  ArrowUp,
  ArrowDown,
  FileCode,
  Rocket,
} from 'lucide-react';
import {
  useWorkspace,
  useWorkspaceInfo,
  useTestWorkspace,
  useRemoveWorkspace,
  useUpdateWorkspace,
} from '../../hooks/useWorkspaces';
import { useCredentials, useCreateCredential } from '../../hooks/useCredentials';
import { useAgents } from '../../hooks/useAgents';
import { useUiStore } from '../../store/uiStore';
import type { WorkspaceTestResult, GitProviderType } from '@codepods/shared-types';
import { cx } from '../../utils/cx';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TemplateIcon } from '../templates/TemplateIcon';
import { SectionHeader } from '../ui/SectionHeader';
import { EmptyState } from '../ui/EmptyState';
import { IconButton } from '../ui/IconButton';
import { inputCls } from '../ui/styles';
import { Field } from '../ui/Field';
import { InfoField } from '../ui/InfoField';
import { DangerConfirmField } from '../ui/DangerConfirmField';
import { SegmentedControl } from '../ui/SegmentedControl';



interface WorkspaceDetailProps {
  workspaceId: number | null;
}

export function WorkspaceDetail({ workspaceId }: WorkspaceDetailProps) {
  const { t } = useTranslation();
  const { data: workspace, isLoading } = useWorkspace(workspaceId);
  const { data: repoInfo } = useWorkspaceInfo(workspaceId);
  const testWs = useTestWorkspace();
  const removeWorkspace = useRemoveWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const { setSelectedWorkspace } = useUiStore();
  const navigate = useNavigate();
  const { data: credentials } = useCredentials();
  const createCredential = useCreateCredential();
  const { data: agents } = useAgents();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const [isEditingRemote, setIsEditingRemote] = useState(false);
  const [editRemoteUrl, setEditRemoteUrl] = useState('');
  const [credMode, setCredMode] = useState<'keep' | 'replace' | 'clear'>('keep');
  const [editCredId, setEditCredId] = useState<number | ''>('');
  const [showNewCred, setShowNewCred] = useState(false);
  const [newCredUser, setNewCredUser] = useState('');
  const [newCredToken, setNewCredToken] = useState('');
  const [remoteError, setRemoteError] = useState<string | null>(null);

  // Push to new remote (local → new GitHub repo)
  const [isCreatingNewRemote, setIsCreatingNewRemote] = useState(false);
  const [nrProvider, setNrProvider] = useState<GitProviderType>('github');
  const [nrRepoName, setNrRepoName] = useState('');
  const [nrPrivate, setNrPrivate] = useState(true);
  const [nrCredMode, setNrCredMode] = useState<'existing' | 'new'>('existing');
  const [nrCredId, setNrCredId] = useState<number | ''>('');
  const [nrCredUsername, setNrCredUsername] = useState('');
  const [nrCredToken, setNrCredToken] = useState('');
  const [nrError, setNrError] = useState<string | null>(null);

  const [testResult, setTestResult] = useState<WorkspaceTestResult | null>(null);

  const [openDanger, setOpenDanger] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (workspace) {
      setEditName(workspace.name);
      setIsEditingName(false);
      setNameError(null);
      setIsEditingRemote(false);
      setRemoteError(null);
      setEditRemoteUrl(workspace.remoteUrl ?? '');
      setCredMode('keep');
      setEditCredId(workspace.credentialId ?? '');
      setShowNewCred(false);
      setNewCredUser('');
      setNewCredToken('');
      setTestResult(null);
      setIsCreatingNewRemote(false);
      setNrRepoName('');
      setNrPrivate(true);
      setNrCredMode(credentials && credentials.length > 0 ? 'existing' : 'new');
      setNrCredId('');
      setNrCredUsername('');
      setNrCredToken('');
      setNrError(null);
    }
  }, [workspace?.id]);

  if (!workspaceId) {
    return (
      <div className="flex h-full select-none items-center justify-center text-sm text-muted-foreground/50">
        {t('workspaces.selectWorkspace')}
      </div>
    );
  }

  if (isLoading || !workspace) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  const canDelete = confirmSlug === workspace.slug;

  const handleSaveName = async () => {
    const name = editName.trim();
    if (!name) {
      setNameError(t('agents.nameRequired'));
      return;
    }
    try {
      await updateWorkspace.mutateAsync({ id: workspace.id, dto: { name } });
      setIsEditingName(false);
    } catch (error: unknown) {
      setNameError(error instanceof Error ? error.message : t('workspaces.saveFailed'));
    }
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    await removeWorkspace.mutateAsync(workspace.id);
    setSelectedWorkspace(null);
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(workspace.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const r = await testWs.mutateAsync(workspace.id);
      setTestResult(r);
    } catch (error: unknown) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : t('workspaces.testFail'),
        latencyMs: 0,
      });
    }
  };

  const openEditRemote = () => {
    setEditRemoteUrl(workspace.remoteUrl ?? '');
    setCredMode(workspace.credentialId ? 'keep' : 'clear');
    setEditCredId(workspace.credentialId ?? '');
    setShowNewCred(false);
    setNewCredUser('');
    setNewCredToken('');
    setRemoteError(null);
    setIsEditingRemote(true);
  };

  const handleSaveRemote = async () => {
    setRemoteError(null);
    const url = editRemoteUrl.trim();
    try {
      if (!url) {
        // Convert to local
        await updateWorkspace.mutateAsync({
          id: workspace.id,
          dto: { type: 'local', remoteUrl: null, credentialId: null },
        });
      } else {
        // Remote
        let credentialId: number | null | undefined = undefined;
        if (credMode === 'keep') {
          credentialId = workspace.credentialId;
        } else if (credMode === 'clear') {
          credentialId = null;
        } else if (credMode === 'replace') {
          if (showNewCred) {
            // Create inline credential
            if (!newCredUser.trim() || !newCredToken.trim()) {
              setRemoteError(t('workspaces.createCred.validationRequired'));
              return;
            }
            const cred = await createCredential.mutateAsync({
              label: newCredUser.trim(),
              type: 'user_pass',
              username: newCredUser.trim(),
              secret: newCredToken.trim(),
              host: hostFromUrl(url),
            });
            credentialId = cred.id;
          } else if (editCredId !== '') {
            credentialId = Number(editCredId);
          } else {
            credentialId = null;
          }
        }
        await updateWorkspace.mutateAsync({
          id: workspace.id,
          dto: { type: 'remote', remoteUrl: url, credentialId },
        });
      }
      setIsEditingRemote(false);
    } catch (error: unknown) {
      setRemoteError(error instanceof Error ? error.message : t('workspaces.saveFailed'));
    }
  };

  const openNewRemote = () => {
    setNrProvider('github');
    setNrRepoName('');
    setNrPrivate(true);
    setNrCredMode(credentials && credentials.length > 0 ? 'existing' : 'new');
    setNrCredId('');
    setNrCredUsername('');
    setNrCredToken('');
    setNrError(null);
    setIsCreatingNewRemote(true);
  };

  const handlePushNewRemote = async () => {
    setNrError(null);
    if (!nrRepoName.trim()) {
      setNrError(t('workspaces.create.validationRequired'));
      return;
    }
    try {
      let credentialId: number | null = null;
      if (nrCredMode === 'existing' && nrCredId !== '') {
        credentialId = Number(nrCredId);
      } else if (nrCredMode === 'new') {
        if (!nrCredUsername.trim() || !nrCredToken.trim()) {
          setNrError(t('workspaces.createCred.validationRequired'));
          return;
        }
        const cred = await createCredential.mutateAsync({
          label: nrCredUsername.trim(),
          type: 'user_pass',
          username: nrCredUsername.trim(),
          secret: nrCredToken.trim(),
          host: 'github.com',
        });
        credentialId = cred.id;
      }
      await updateWorkspace.mutateAsync({
        id: workspace.id,
        dto: {
          gitProvider: nrProvider,
          repoName: nrRepoName.trim(),
          repoPrivate: nrPrivate,
          credentialId,
        },
      });
      setIsCreatingNewRemote(false);
    } catch (error: unknown) {
      setNrError(error instanceof Error ? error.message : t('workspaces.saveFailed'));
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 h-12">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary-item">
            <FolderGit2 className="h-4 w-4 text-foreground" />
          </div>
          {isEditingName ? (
            <div className="flex items-center gap-1">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleSaveName(); }
                  if (e.key === 'Escape') { setIsEditingName(false); setNameError(null); }
                }}
                className="w-[280px] max-w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                autoFocus
              />
              <IconButton onClick={handleSaveName} loading={updateWorkspace.isPending} icon={<Check className="h-4 w-4" />} title={t('common.save')} hover="hover:bg-primary/15 hover:text-primary-soft" />
              <IconButton onClick={() => { setIsEditingName(false); setNameError(null); }} icon={<X className="h-4 w-4" />} title={t('common.cancel')} hover="hover:bg-primary/15 hover:text-primary-soft" />
              {nameError && <span className="ml-1 text-xs text-destructive">{nameError}</span>}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-sm font-semibold text-foreground">{workspace.name}</h1>
              <button
                onClick={() => setIsEditingName(true)}
                title={t('workspaces.editName')}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-primary-soft"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <span
                className={cx(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium',
                  workspace.type === 'remote' ? 'bg-primary/15 text-primary-soft' : 'bg-secondary-item text-muted-foreground',
                )}
              >
                {workspace.type === 'remote' ? t('workspaces.remote') : t('workspaces.local')}
              </span>
              {workspace.branch && (
                <span className="inline-flex items-center gap-1 rounded bg-secondary-item px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <GitBranch className="h-3 w-3" /> {workspace.branch}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Remote configuration */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader size="sm" title={t('workspaces.connectionSettings')} />
            {!isEditingRemote && !isCreatingNewRemote ? (
              <div className="flex items-center gap-1">
                {workspace.type === 'remote' && (
                  <button
                    onClick={handleTest}
                    disabled={testWs.isPending}
                    className="inline-flex items-center gap-1.5 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                  >
                    {testWs.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    {testWs.isPending ? t('workspaces.testing') : t('workspaces.testConnection')}
                  </button>
                )}
                {workspace.type === 'local' && (
                  <button
                    onClick={openNewRemote}
                    disabled={updateWorkspace.isPending}
                    className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                  >
                    <Rocket className="h-3 w-3" />
                    {t('workspaces.pushNewRemote')}
                  </button>
                )}
                <button
                  onClick={openEditRemote}
                  className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary-item"
                >
                  <Pencil className="h-3 w-3" />
                  {workspace.type === 'remote' ? t('workspaces.editConnection') : t('workspaces.addRemote')}
                </button>
              </div>
            ) : isCreatingNewRemote ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePushNewRemote}
                  disabled={updateWorkspace.isPending || createCredential.isPending}
                  className="inline-flex items-center gap-1 rounded border border-emerald-600/50 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
                >
                  {updateWorkspace.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
                  {t('workspaces.pushNewRemote')}
                </button>
                <button
                  onClick={() => { setIsCreatingNewRemote(false); setNrError(null); }}
                  className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary-item"
                >
                  <X className="h-3 w-3" />
                  {t('workspaces.cancelEdit')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleSaveRemote}
                  disabled={updateWorkspace.isPending || createCredential.isPending}
                  className="inline-flex items-center gap-1 rounded border border-emerald-600/50 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
                >
                  {updateWorkspace.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  {t('common.save')}
                </button>
                <button
                  onClick={() => { setIsEditingRemote(false); setRemoteError(null); }}
                  className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary-item"
                >
                  <X className="h-3 w-3" />
                  {t('workspaces.cancelEdit')}
                </button>
              </div>
            )}
          </div>

          {!isEditingRemote && !isCreatingNewRemote ? (
            workspace.type === 'remote' ? (
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-secondary-item/50 p-3">
                <InfoField label={t('workspaces.remoteUrl')}>
                  {workspace.remoteUrl ?? '—'}
                </InfoField>
                <InfoField label={t('workspaces.credential')}>
                  {workspace.credentialId
                    ? credentials?.find((c) => c.id === workspace.credentialId)?.label ?? '—'
                    : t('workspaces.noCredential')}
                </InfoField>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-secondary-item/50 p-3">
                <EmptyState message={t('workspaces.noRemote')} className="" />
              </div>
            )
          ) : isCreatingNewRemote ? (
            <div className="space-y-3 rounded-lg border border-border bg-secondary-item/50 p-3">
              <p className="text-xs text-muted-foreground">{t('workspaces.newRemoteHint')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('workspaces.gitProvider')}>
                  <select
                    value={nrProvider}
                    onChange={(e) => setNrProvider(e.target.value as GitProviderType)}
                    className={inputCls}
                  >
                    <option value="github">GitHub</option>
                  </select>
                </Field>
                <Field label={t('workspaces.repoVisibility')}>
                  <select
                    value={nrPrivate ? 'private' : 'public'}
                    onChange={(e) => setNrPrivate(e.target.value === 'private')}
                    className={inputCls}
                  >
                    <option value="private">{t('workspaces.repoPrivate')}</option>
                    <option value="public">{t('workspaces.repoPublic')}</option>
                  </select>
                </Field>
              </div>
              <Field label={t('workspaces.repoName')}>
                <input
                  value={nrRepoName}
                  onChange={(e) => setNrRepoName(e.target.value)}
                  placeholder={t('workspaces.repoNamePlaceholder')}
                  className={inputCls}
                  autoFocus
                />
              </Field>
              {/* Credential selector */}
              <Field label={t('workspaces.credential')}>
                <div className="flex gap-2">
                  <select
                    value={nrCredMode === 'existing' ? nrCredId : 'new'}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'new') {
                        setNrCredMode('new');
                        setNrCredId('');
                      } else {
                        setNrCredMode('existing');
                        setNrCredId(Number(v));
                      }
                    }}
                    className={inputCls}
                  >
                    <option value="new">+ {t('workspaces.newCredential')}</option>
                    {credentials?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} ({c.host})
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
              {nrCredMode === 'new' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('workspaces.credentialUsername')}>
                    <input
                      value={nrCredUsername}
                      onChange={(e) => setNrCredUsername(e.target.value)}
                      placeholder="user"
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t('workspaces.credentialPassword')}>
                    <input
                      type="password"
                      value={nrCredToken}
                      onChange={(e) => setNrCredToken(e.target.value)}
                      placeholder="ghp_..."
                      className={inputCls}
                    />
                  </Field>
                </div>
              )}
              {nrError && <p className="text-xs text-destructive">{nrError}</p>}
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-border bg-secondary-item/50 p-3">
              <InfoField label={t('workspaces.remoteUrl')} editing>
                <input
                  value={editRemoteUrl}
                  onChange={(e) => setEditRemoteUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className={inputCls}
                />
              </InfoField>

              {/* Credential modes (only meaningful if remote URL is set) */}
              {editRemoteUrl.trim() && (
                <div className="space-y-2">
                  <Field label={t('workspaces.credential')}>
                    <SegmentedControl
                      options={[
                        { value: 'keep', label: t('workspaces.credentialMode.keep') },
                        { value: 'replace', label: t('workspaces.credentialMode.replace') },
                        { value: 'clear', label: t('workspaces.credentialMode.clear') },
                      ]}
                      value={credMode}
                      onChange={(mode) => {
                        setCredMode(mode);
                        setShowNewCred(false);
                      }}
                    />
                  </Field>
                  {credMode === 'replace' && (
                    <div className="space-y-2">
                      {!showNewCred ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={editCredId}
                            onChange={(e) => setEditCredId(e.target.value === '' ? '' : Number(e.target.value))}
                            className={inputCls + ' flex-1'}
                          >
                            <option value="">{t('workspaces.noCredential')}</option>
                            {credentials?.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label} ({c.host})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowNewCred(true)}
                            title={t('workspaces.credentialNew')}
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-2 text-xs text-foreground hover:bg-secondary-item"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 rounded border border-border bg-background/40 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{t('workspaces.credentialNew')}</span>
                            <button
                              type="button"
                              onClick={() => { setShowNewCred(false); setNewCredUser(''); setNewCredToken(''); }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            <input
                              value={newCredUser}
                              onChange={(e) => setNewCredUser(e.target.value)}
                              placeholder={t('workspaces.credentialUsernamePlaceholder')}
                              className={inputCls}
                            />
                            <input
                              type="password"
                              value={newCredToken}
                              onChange={(e) => setNewCredToken(e.target.value)}
                              placeholder={t('workspaces.credentialTokenPlaceholder')}
                              className={inputCls}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {remoteError && <p className="text-xs text-destructive">{remoteError}</p>}
            </div>
          )}
        </section>

        {testResult && (
          <div className="flex items-center gap-2 text-xs">
            {testResult.ok ? (
              <span className="text-emerald-500">{t('workspaces.testOk')} · {testResult.latencyMs}ms</span>
            ) : (
              <div className="flex flex-col gap-0.5">
                <span className="text-destructive">{t('workspaces.testFail')} · {testResult.latencyMs}ms</span>
                {testResult.message && <span className="text-muted-foreground">{testResult.message}</span>}
              </div>
            )}
          </div>
        )}

        {/* Repository info */}
        <section className="space-y-3">
          <SectionHeader size="sm" title={t('workspaces.repoInfo')} />
          <div className="rounded-lg border border-border bg-secondary-item/50 p-3 space-y-3">
            {/* Info grid */}
            {repoInfo && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <InfoRow icon={<GitBranch className="h-3.5 w-3.5" />} label={t('workspaces.branch')} value={repoInfo.branch ?? '—'} />
                {repoInfo.head && (
                  <>
                    <InfoRow
                      icon={<GitCommit className="h-3.5 w-3.5" />}
                      label={t('workspaces.lastCommit')}
                      value={repoInfo.head.shortHash ? `${repoInfo.head.shortHash} ${repoInfo.head.author ?? ''}`.trim() : t('workspaces.noCommits')}
                      title={repoInfo.head.message ?? undefined}
                    />
                    {repoInfo.head.date && (
                      <InfoRow icon={<Clock className="h-3.5 w-3.5" />} label={t('workspaces.updatedAt')} value={formatDate(repoInfo.head.date)} />
                    )}
                  </>
                )}
                <InfoRow icon={<TagIcon className="h-3.5 w-3.5" />} label={t('workspaces.lastTag')} value={repoInfo.lastTag ?? t('workspaces.noTag')} />
                <div className="flex items-center gap-2">
                  <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{t('workspaces.dirty')}</span>
                  <span className={cx('text-xs', repoInfo.dirty ? 'text-amber-400' : 'text-emerald-500')}>
                    {repoInfo.dirty ? t('workspaces.dirty') : t('workspaces.clean')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{t('workspaces.ahead')}</span>
                  <span className="text-xs text-foreground">{repoInfo.ahead ?? t('workspaces.noUpstream')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{t('workspaces.behind')}</span>
                  <span className="text-xs text-foreground">{repoInfo.behind ?? t('workspaces.noUpstream')}</span>
                </div>
              </div>
            )}

            {/* Path with copy */}
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">{t('workspaces.path')}</span>
              <code className="flex-1 truncate rounded bg-background/60 px-2 py-1 text-xs text-foreground">{workspace.path}</code>
              <button onClick={handleCopyPath} title={t('common.copy')} className="rounded p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary-soft">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </section>

        {/* Linked agents */}
        <section className="space-y-3">
          <SectionHeader size="sm" title={t('workspaces.linkedAgents')} />
          <div className="rounded-lg border border-border bg-secondary-item/50 p-3">
            {(() => {
              const linked = agents?.filter((a) => a.workspaceId === workspace.id) ?? [];
              if (linked.length === 0) {
                return <EmptyState message={t('workspaces.noLinkedAgents')} className="" />;
              }
              return (
                <div className="space-y-1.5">
                  {linked.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => navigate(`/agents/${encodeURIComponent(a.name)}`)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-secondary-item"
                    >
                      <TemplateIcon
                        icon={a.templateIcon}
                        iconDark={a.templateIconDark}
                        className="h-5 w-5"
                      />
                      <span className="flex-1 truncate text-sm text-foreground">{a.name}</span>
                      <span
                        className={cx(
                          'rounded px-1.5 py-0.5 text-[10px] font-medium',
                          a.status === 'running'
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : 'bg-secondary-item text-muted-foreground',
                        )}
                      >
                        {a.status}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </section>

        {/* Danger Zone */}
        <div className={cx('rounded-lg border', openDanger ? 'border-red-500/30' : 'border-red-500/20')}>
          <button
            onClick={() => setOpenDanger((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-red-500/5"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="flex-1 text-left">{t('workspaces.dangerZone')}</span>
            {openDanger ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {openDanger && (
            <div className="space-y-3 px-3 pb-3 pt-1">
              <p className="text-xs text-muted-foreground">{t('workspaces.delete.confirm')}</p>
              <DangerConfirmField
                label={
                  <>
                    {t('workspaces.dangerTypeConfirm')}{' '}
                    <span className="font-mono text-destructive">{workspace.slug}</span>
                  </>
                }
                value={confirmSlug}
                onChange={setConfirmSlug}
                placeholder={workspace.slug}
              />
              <div className="flex justify-end">
                <button
                  onClick={handleDelete}
                  disabled={!canDelete || removeWorkspace.isPending}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                    'bg-red-600 text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                >
                  {removeWorkspace.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {t('workspaces.delete.title')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, title }: { icon: React.ReactNode; label: string; value: string; title?: string }) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-xs text-foreground">{value}</span>
    </div>
  );
}



function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}