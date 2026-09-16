import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BrainCircuit,
  Check,
  Copy,
  Cpu,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  useAiProvider,
  useRemoveAiProvider,
  useUpdateAiProvider,
  useTestAiProvider,
  useCreateAiModel,
  useRemoveAiModel,
  useUpdateAiModel,
} from '../../hooks/useAiProviders';
import { useCredentials, useCreateCredential } from '../../hooks/useCredentials';
import { useUiStore } from '../../store/uiStore';
import { AI_PROVIDER_TYPES, PROVIDER_BASE_URL_PRESETS } from '@codepods/shared-types';
import type {
  AiProviderType,
  AiProviderTestResult,
} from '@codepods/shared-types';
import { cx } from '../../utils/cx';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { ConfirmDeleteButton } from '../ui/ConfirmDeleteButton';
import { SectionHeader } from '../ui/SectionHeader';
import { EmptyState } from '../ui/EmptyState';
import { IconButton } from '../ui/IconButton';
import { inputCls, secondaryBtnCls } from '../ui/styles';
import { SegmentedControl } from '../ui/SegmentedControl';
import { InfoField } from '../ui/InfoField';
import { ContentShell } from '../ContentShell';
import { TemplateIcon } from '../templates/TemplateIcon';

interface AiProviderDetailProps {
  providerId: number | null;
}

export function AiProviderDetail({ providerId }: AiProviderDetailProps) {
  const { t } = useTranslation();
  const { data: provider, isLoading } = useAiProvider(providerId);
  const removeProvider = useRemoveAiProvider();
  const updateProvider = useUpdateAiProvider();
  const { setSelectedAiProvider } = useUiStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editType, setEditType] = useState<AiProviderType>('openai');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [keyMode, setKeyMode] = useState<'keep' | 'replace' | 'clear' | 'envvar'>('keep');
  const [newKey, setNewKey] = useState('');
  const [newEnvVar, setNewEnvVar] = useState('');
  const [editCredentialId, setEditCredentialId] = useState<string>('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [newModelName, setNewModelName] = useState('');
  const [newModelDisplayName, setNewModelDisplayName] = useState('');

  const [editingModelId, setEditingModelId] = useState<number | null>(null);
  const [editModelName, setEditModelName] = useState('');
  const [editModelDisplayName, setEditModelDisplayName] = useState('');

  const [providerTest, setProviderTest] = useState<AiProviderTestResult[] | null>(null);
  const [modelTests, setModelTests] = useState<Record<number, AiProviderTestResult[] | null>>({});

  const [copied, setCopied] = useState(false);
  const [confirmDeleteModelId, setConfirmDeleteModelId] = useState<number | null>(null);

  const testProvider = useTestAiProvider();
  const createModel = useCreateAiModel();
  const removeModel = useRemoveAiModel();
  const updateModel = useUpdateAiModel();
  const { data: credentials } = useCredentials();
  const createCredential = useCreateCredential();

  useEffect(() => {
    if (provider) {
      setEditName(provider.name);
      setEditType(provider.type);
      setEditBaseUrl(provider.baseUrl);
      setKeyMode('keep');
      setNewKey('');
      setNewEnvVar(provider.apiKeyEnvVar ?? '');
      setEditCredentialId(provider.credentialId ? String(provider.credentialId) : '');
      setSaveError(null);
      setNameError(null);
      setSaved(false);
      setProviderTest(null);
      setModelTests({});
    }
  }, [provider?.id]);

  if (!providerId) {
    return (
      <div className="flex h-full select-none items-center justify-center text-sm text-muted-foreground">
        {t('aiProviders.selectProvider')}
      </div>
    );
  }

  if (isLoading || !provider) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  const handleSaveName = async () => {
    setNameError(null);
    const name = editName.trim();
    if (!name) {
      setNameError(t('agents.nameRequired'));
      return;
    }
    if (name.toLowerCase() === 'default') {
      setNameError(t('aiProviders.nameReserved'));
      return;
    }
    try {
      await updateProvider.mutateAsync({ id: provider.id, dto: { name } });
      setIsEditingName(false);
    } catch (error: unknown) {
      setNameError(error instanceof Error ? error.message : t('aiProviders.saveFailed'));
    }
  };

  const handleSaveConfig = async () => {
    setSaveError(null);
    setSaved(false);
    try {
      // When "replace key" is chosen, create a unified credential (type='key')
      // from the typed plaintext and link it via credentialId, instead of
      // storing the key inline on the provider.
      let credentialId = editCredentialId ? Number(editCredentialId) : null;
      if (keyMode === 'replace') {
        const trimmed = newKey.trim();
        if (!trimmed) {
          setSaveError(t('aiProviders.keyRequired'));
          return;
        }
        const created = await createCredential.mutateAsync({
          label: `${editName || provider.name} key`,
          type: 'key' as const,
          secret: trimmed,
        });
        credentialId = created.id;
      }
      await updateProvider.mutateAsync({
        id: provider.id,
        dto: {
          type: editType,
          baseUrl: editBaseUrl.trim(),
          apiKeyEnvVar: keyMode === 'envvar' ? newEnvVar.trim() || null : undefined,
          credentialId:
            keyMode === 'replace'
              ? credentialId
              : keyMode === 'clear' || keyMode === 'envvar'
                ? null
                : credentialId,
        },
      });
      setIsEditingConfig(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : t('aiProviders.saveFailed'));
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(t('aiProviders.removeConfirm'))) return;
    await removeProvider.mutateAsync(provider.id);
    setSelectedAiProvider(null);
  };

  const handleSetDefaultProvider = () =>
    updateProvider.mutateAsync({ id: provider.id, dto: { isDefault: true } });

  const handleToggleEnabled = () =>
    updateProvider.mutateAsync({ id: provider.id, dto: { enabled: !provider.enabled } });

  const handleAddModel = async () => {
    const name = newModelName.trim();
    if (!name) return;
    await createModel.mutateAsync({
      providerId: provider.id,
      dto: {
        name,
        displayName: newModelDisplayName.trim() || null,
        isDefault: (provider.models ?? []).length === 0,
      },
    });
    setNewModelName('');
    setNewModelDisplayName('');
  };

  const handleStartModelEdit = (modelId: number, name: string, displayName: string | null) => {
    setEditingModelId(modelId);
    setEditModelName(name);
    setEditModelDisplayName(displayName ?? '');
    setConfirmDeleteModelId(null);
  };

  const handleSaveModelEdit = async (modelId: number) => {
    const name = editModelName.trim();
    if (!name) return;
    await updateModel.mutateAsync({
      providerId: provider.id,
      modelId,
      dto: {
        name,
        displayName: editModelDisplayName.trim() || null,
      },
    });
    setEditingModelId(null);
  };

  const handleSetDefault = (modelId: number) =>
    updateModel.mutateAsync({
      providerId: provider.id,
      modelId,
      dto: { isDefault: true },
    });

  const handleRemoveModel = async (modelId: number) => {
    await removeModel.mutateAsync({ providerId: provider.id, modelId });
    setConfirmDeleteModelId(null);
  };

  const handleTestProvider = async () => {
    setProviderTest(null);
    try {
      const result = await testProvider.mutateAsync({ id: provider.id });
      setProviderTest(result);
    } catch (error: unknown) {
      setProviderTest([{
        ok: false,
        latencyMs: 0,
        message: error instanceof Error ? error.message : t('aiProviders.testFail'),
      }]);
    }
  };

  const handleTestModel = async (modelId: number) => {
    setModelTests((prev) => ({ ...prev, [modelId]: null }));
    try {
      const result = await testProvider.mutateAsync({ id: provider.id, modelId });
      setModelTests((prev) => ({ ...prev, [modelId]: result }));
    } catch (error: unknown) {
      setModelTests((prev) => ({
        ...prev,
        [modelId]: [{
          ok: false,
          latencyMs: 0,
          message: error instanceof Error ? error.message : t('aiProviders.testFail'),
        }],
      }));
    }
  };

  const proxyBase = `http://host.docker.internal:3000/api/ai-proxy/${provider.slug}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(proxyBase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ContentShell
      title={isEditingName ? (
        <div className="flex min-w-0 items-center gap-1">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleSaveName(); }
              if (e.key === 'Escape') { setIsEditingName(false); setNameError(null); }
            }}
            className="w-[200px] max-w-full rounded border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
            autoFocus
          />
          <IconButton
            onClick={handleSaveName}
            loading={updateProvider.isPending}
            icon={<Check className="h-4 w-4" />}
            title={t('common.save')}
            hover="hover:bg-primary/15 hover:text-primary-soft"
          />
          <IconButton
            onClick={() => { setIsEditingName(false); setNameError(null); }}
            icon={<X className="h-4 w-4" />}
            title={t('common.cancel')}
            hover="hover:bg-primary/15 hover:text-primary-soft"
          />
          {nameError && <span className="ml-1 text-xs text-destructive">{nameError}</span>}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <h1 className="truncate text-sm font-semibold text-foreground">{provider.name}</h1>
          <button
            onClick={() => setIsEditingName(true)}
            title={t('aiProviders.editName')}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-primary-soft"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {!provider.enabled && (
            <span className="inline-flex items-center rounded bg-secondary-item px-1.5 py-0.5 text-xs text-muted-foreground">
              {t('aiProviders.disabled')}
            </span>
          )}
        </div>
      )}
      icon={provider.iconUrl
        ? ({ className }) => <TemplateIcon icon={provider.iconUrl} iconDark={provider.iconDarkUrl} className={className} />
        : BrainCircuit}
      actions={[
        saved && (
          <span key="saved" className="mr-1 inline-flex items-center gap-1 text-xs text-emerald-500">
            <Check className="h-3 w-3" /> {t('aiProviders.saved')}
          </span>
        ),
        <ToggleSwitch
          key="toggle"
          checked={provider.enabled}
          onChange={handleToggleEnabled}
          disabled={updateProvider.isPending || provider.isDefault}
          labelOn={provider.isDefault ? t('aiProviders.cannotDisableDefault') : t('aiProviders.disable')}
          labelOff={t('aiProviders.enable')}
        />,
        <button
          key="default"
          onClick={handleSetDefaultProvider}
          disabled={updateProvider.isPending || provider.isDefault}
          title={t('aiProviders.setAsDefaultProvider')}
          className={cx(
            'rounded p-1.5 transition-colors',
            provider.isDefault
              ? 'cursor-default text-amber-600 dark:text-amber-500'
              : 'text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-500',
          )}
        >
          {updateProvider.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Star className={cx('h-4 w-4', provider.isDefault && 'fill-amber-500')} />
          )}
        </button>,
        <IconButton
          key="delete"
          onClick={handleRemove}
          loading={removeProvider.isPending}
          icon={<Trash2 className="h-4 w-4" />}
          title={t('aiProviders.delete')}
          hover="hover:bg-destructive/10 hover:text-destructive"
        />,
      ]}
    >
      <div className="min-w-0 max-w-4xl mx-auto px-4 py-4 space-y-6">
        {/* Proxy base URL */}
        <section className="rounded-lg border border-border bg-secondary-item/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('aiProviders.proxyHint')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('aiProviders.proxyHintDescription')}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs text-foreground">
              {proxyBase}
            </code>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary-item"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" /> {t('aiProviders.copied')}
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> {t('aiProviders.copy')}
                </>
              )}
            </button>
          </div>
        </section>

        {/* Provider config */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader size="sm" title={t('aiProviders.connectionSettings')} />
            {!isEditingConfig ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleTestProvider}
                  disabled={testProvider.isPending}
                  className="inline-flex items-center gap-1.5 rounded bg-primary px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {testProvider.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  {testProvider.isPending ? t('aiProviders.testing') : t('aiProviders.test')}
                </button>
                <button
                  onClick={() => setIsEditingConfig(true)}
                  className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary-item"
                >
                  <Pencil className="h-3 w-3" />
                  {t('aiProviders.editConnection')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleSaveConfig}
                  disabled={updateProvider.isPending}
                  className="inline-flex items-center gap-1 rounded border border-emerald-600/50 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-500 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
                >
                  {updateProvider.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  {t('common.save')}
                </button>
                <button
                  onClick={() => { setIsEditingConfig(false); setSaveError(null); }}
                  className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary-item"
                >
                  <X className="h-3 w-3" />
                  {t('aiProviders.cancelEdit')}
                </button>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border bg-secondary-item/50 p-3 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <InfoField label={t('aiProviders.type')} editing={isEditingConfig}>
              {isEditingConfig ? (
                <select
                  value={editType}
                  onChange={(e) => {
                    setEditType(e.target.value as AiProviderType);
                    if (!editBaseUrl.trim() || editBaseUrl === PROVIDER_BASE_URL_PRESETS[provider.type]) {
                      setEditBaseUrl(PROVIDER_BASE_URL_PRESETS[e.target.value as AiProviderType]);
                    }
                  }}
                  className={inputCls}
                >
                  {AI_PROVIDER_TYPES.map((tp) => (
                    <option key={tp} value={tp}>
                      {tp}
                    </option>
                  ))}
                </select>
              ) : (
                provider.type
              )}
            </InfoField>
            <InfoField label={t('aiProviders.baseUrl')} editing={isEditingConfig}>
              {isEditingConfig ? (
                <input
                  value={editBaseUrl}
                  onChange={(e) => setEditBaseUrl(e.target.value)}
                  className={inputCls}
                />
              ) : (
                provider.baseUrl
              )}
            </InfoField>
          </div>

          {/* API key management */}
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">{t('aiProviders.apiKey')}</span>
            {!isEditingConfig ? (
              <p className="text-sm text-foreground">
                {provider.credentialId
                  ? t('aiProviders.credential') + ': ' + (credentials?.find((c) => c.id === provider.credentialId)?.label ?? t('aiProviders.noCredential'))
                  : provider.apiKeyEnvVar
                    ? t('aiProviders.apiKeyEnvVar') + ` (${provider.apiKeyEnvVar})`
                    : t('aiProviders.apiKeyNone')}
              </p>
            ) : (
              <>
                <SegmentedControl
                  options={[
                    { value: 'keep', label: t('aiProviders.apiKeyKeep') },
                    { value: 'replace', label: t('aiProviders.apiKeyReplace') },
                    { value: 'clear', label: t('aiProviders.apiKeyClear') },
                    { value: 'envvar', label: t('aiProviders.apiKeyEnvVar') },
                  ]}
                  value={keyMode}
                  onChange={setKeyMode}
                />
                {keyMode === 'replace' && (
                  <input
                    type="password"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="sk-..."
                    className={inputCls}
                  />
                )}
                {keyMode === 'envvar' && (
                  <input
                    value={newEnvVar}
                    onChange={(e) => setNewEnvVar(e.target.value)}
                    placeholder="OPENAI_API_KEY"
                    className={inputCls}
                  />
                )}
              </>
            )}
          </div>

          {/* Linked credential (unified credential store).
              During 'replace' a new credential is created from the typed key,
              so the dropdown is only relevant in 'keep' mode. */}
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">{t('aiProviders.credential')}</span>
            {!isEditingConfig ? (
              <p className="text-sm text-foreground">
                {provider.credentialId
                  ? credentials?.find((c) => c.id === provider.credentialId)?.label ?? t('aiProviders.noCredential')
                  : t('aiProviders.noCredential')}
              </p>
            ) : keyMode === 'keep' ? (
              <select
                value={editCredentialId}
                onChange={(e) => setEditCredentialId(e.target.value)}
                className={inputCls}
              >
                <option value="">{t('aiProviders.noCredential')}</option>
                {(credentials ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">{t('aiProviders.credentialManagedByKeyMode')}</p>
            )}
          </div>

          {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          </div>
          {providerTest && <TestResults results={providerTest} />}
        </section>

        {/* Models */}
        <section className="space-y-3">
          <SectionHeader size="sm" title={t('aiProviders.models')} />

          {(provider.models ?? []).length === 0 && (
            <EmptyState message={t('aiProviders.noModels')} className="" />
          )}

          {(provider.models ?? []).map((model) => {
            const test = modelTests[model.id] ?? null;
            const isConfirming = confirmDeleteModelId === model.id;
            const isEditingModel = editingModelId === model.id;
            return (
              <div
                key={model.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-secondary-item/50 px-3 py-2.5"
              >
                {isEditingModel ? (
                  <>
                    <div className="flex flex-1 min-w-0 items-center gap-2">
                      <input
                        value={editModelDisplayName}
                        onChange={(e) => setEditModelDisplayName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleSaveModelEdit(model.id); }
                          if (e.key === 'Escape') { setEditingModelId(null); }
                        }}
                        placeholder={t('aiProviders.addModelDisplayPlaceholder')}
                        className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                        autoFocus
                      />
                      <input
                        value={editModelName}
                        onChange={(e) => setEditModelName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleSaveModelEdit(model.id); }
                          if (e.key === 'Escape') { setEditingModelId(null); }
                        }}
                        placeholder={t('aiProviders.addModelPlaceholder')}
                        className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <IconButton
                      onClick={() => handleSaveModelEdit(model.id)}
                      loading={updateModel.isPending}
                      icon={<Check className="h-4 w-4" />}
                      title={t('common.save')}
                      hover="hover:bg-primary/15 hover:text-primary-soft"
                    />
                    <IconButton
                      onClick={() => setEditingModelId(null)}
                      icon={<X className="h-4 w-4" />}
                      title={t('common.cancel')}
                      hover="hover:bg-primary/15 hover:text-primary-soft"
                    />
                  </>
                ) : (
                  <>
                    <Cpu className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                    <div className="min-w-0 flex-1 truncate">
                      {model.displayName ? (
                        <span className="truncate text-sm font-medium text-foreground">{model.displayName}</span>
                      ) : (
                        <span className="truncate text-sm font-medium text-foreground">{model.name}</span>
                      )}
                      {model.displayName && (
                        <span className="ml-2 truncate text-xs text-muted-foreground">{model.name}</span>
                      )}
                    </div>
                    {test && (
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        {test.map((r, i) => (
                          <span
                            key={i}
                            className={
                              r.ok
                                ? 'text-xs text-emerald-500'
                                : 'text-xs text-destructive'
                            }
                          >
                            {r.endpoint && `${r.endpoint} · `}
                            {r.ok ? t('aiProviders.testOk') : t('aiProviders.testFail')} · {r.latencyMs}ms
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => handleSetDefault(model.id)}
                      disabled={updateModel.isPending || model.isDefault}
                      title={model.isDefault ? t('aiProviders.modelDefault') : t('aiProviders.setDefault')}
                      className={cx(
                        'rounded p-1 transition-colors disabled:cursor-default',
                        model.isDefault
                          ? 'text-amber-600 dark:text-amber-500'
                          : 'text-muted-foreground/50 hover:text-amber-600 dark:text-amber-500',
                      )}
                    >
                      {updateModel.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Star className={cx('h-3.5 w-3.5', model.isDefault && 'fill-amber-500')} />
                      )}
                    </button>
                    <button
                      onClick={() => handleTestModel(model.id)}
                      disabled={testProvider.isPending}
                      title={t('aiProviders.testSpecificModel')}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                    >
                      {testProvider.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleStartModelEdit(model.id, model.name, model.displayName)}
                      disabled={updateModel.isPending}
                      title={t('aiProviders.editModel')}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <ConfirmDeleteButton
                      confirming={isConfirming}
                      pending={removeModel.isPending}
                      onConfirmToggle={(c) => (c ? setConfirmDeleteModelId(model.id) : setConfirmDeleteModelId(null))}
                      onDelete={() => handleRemoveModel(model.id)}
                      deleteTitle={t('aiProviders.removeModel')}
                      confirmTitle={t('aiProviders.confirmRemoveModel')}
                    />
                  </>
                )}
              </div>
            );
          })}

          {/* Add model */}
          <div className="flex items-center gap-2">
            <input
              value={newModelDisplayName}
              onChange={(e) => setNewModelDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddModel();
                }
              }}
              placeholder={t('aiProviders.addModelDisplayPlaceholder')}
              className={inputCls + ' flex-1 min-w-0'}
            />
            <input
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddModel();
                }
              }}
              placeholder={t('aiProviders.addModelPlaceholder')}
              className={inputCls + ' flex-1 min-w-0'}
            />
            <button
              onClick={handleAddModel}
              disabled={!newModelName.trim() || createModel.isPending}
              className={secondaryBtnCls}
            >
              {createModel.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {t('aiProviders.addModel')}
            </button>
          </div>
        </section>
      </div>
    </ContentShell>
  );
}

function TestResults({ results }: { results: AiProviderTestResult[] }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 space-y-2 text-xs">
      {results.map((r, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <span className={r.ok ? 'text-emerald-500' : 'text-destructive'}>
            {r.endpoint && <span className="text-foreground">{r.endpoint}: </span>}
            {r.ok ? t('aiProviders.testOk') : t('aiProviders.testFail')}
            {r.status && ` · ${r.status}`}
            {` · ${r.latencyMs}ms`}
          </span>
          {r.model && <span className="text-muted-foreground">({r.model})</span>}
          {!r.ok && r.message && <p className="text-muted-foreground">{r.message}</p>}
        </div>
      ))}
    </div>
  );
}




