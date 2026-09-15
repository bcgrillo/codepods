import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Plus, Star, X } from 'lucide-react';
import { useCreateAiProvider } from '../../hooks/useAiProviders';
import { useCreateCredential } from '../../hooks/useCredentials';
import { useDiscoveredProviders } from '../../hooks/useCentralRepos';
import {
  AI_PROVIDER_TYPES,
  PROVIDER_BASE_URL_PRESETS,
} from '@codepods/shared-types';
import type { AiProviderType, CreateAiModelDto, DiscoveredProvider } from '@codepods/shared-types';
import { CreatePage } from '../layout/CreatePage';
import { inputCls } from '../ui/styles';
import { Field } from '../ui/Field';
import { ToggleRow } from '../ui/ToggleRow';
import { SectionHeader } from '../ui/SectionHeader';
import { PrimaryButton, SecondaryButton } from '../ui/buttons';
import { StepIndicator } from '../ui/StepIndicator';
import { ChoiceGrid, type ChoiceCard } from '../ui/ChoiceGrid';
import { FormContainer } from '../ui/FormContainer';
import { SegmentedControl } from '../ui/SegmentedControl';
import { TemplateIcon } from '../templates/TemplateIcon';

interface CreateAiProviderModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (providerId: number) => void;
  /** When 'page', renders inline in the content area instead of as an overlay. */
  variant?: 'modal' | 'page';
}

interface ModelRow {
  name: string;
  displayName: string;
  isDefault: boolean;
}

function providerIcon(icon: string | null | undefined, repoPath: string): string | null {
  if (!icon || icon.trim() === '') return null;
  return `/api/central-repos/repo-file/providers/${repoPath}/${icon}`;
}

export function CreateAiProviderModal({
  open,
  onClose,
  onCreated,
  variant = 'modal',
}: CreateAiProviderModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createProvider = useCreateAiProvider();
  const createCredential = useCreateCredential();
  const discoveredProviders = useDiscoveredProviders();
  const [selectedDiscovered, setSelectedDiscovered] = useState<DiscoveredProvider | null>(null);

  const isLoading = discoveredProviders.isLoading;
  const hasDiscovered = (discoveredProviders.data?.length ?? 0) > 0;
  const [step, setStep] = useState(1);

  // Skip to configure step once loading completes and no discovered items exist
  useEffect(() => {
    if (!isLoading && !hasDiscovered) {
      setStep(2);
    }
  }, [isLoading, hasDiscovered]);

  const [name, setName] = useState('');
  const [type, setType] = useState<AiProviderType>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKeyMode, setApiKeyMode] = useState<'stored' | 'envvar' | 'none'>('stored');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyEnvVar, setApiKeyEnvVar] = useState('');
  const [isDefaultProvider, setIsDefaultProvider] = useState(false);
  const [models, setModels] = useState<ModelRow[]>([{ name: '', displayName: '', isDefault: true }]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!open) return null;

  const handleTypeChange = (newType: AiProviderType) => {
    setType(newType);
    if (!baseUrl.trim()) {
      setBaseUrl(PROVIDER_BASE_URL_PRESETS[newType]);
    }
  };

  const selectDiscovered = (p: DiscoveredProvider) => {
    setSelectedDiscovered(p);
    setName(p.displayName);
    setBaseUrl(p.baseUrl);
    setStep(2);
  };

  const selectManual = () => {
    setSelectedDiscovered(null);
    setName('');
    setBaseUrl('');
    setStep(2);
  };

  const addModelRow = () =>
    setModels((prev) => [...prev, { name: '', displayName: '', isDefault: false }]);

  const removeModelRow = (idx: number) =>
    setModels((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (!next.some((m) => m.isDefault) && next.length > 0) {
        next[0].isDefault = true;
      }
      return next;
    });

  const setModelDefault = (idx: number) =>
    setModels((prev) => prev.map((m, i) => ({ ...m, isDefault: i === idx })));

  const updateModel = (idx: number, field: keyof ModelRow, value: string | boolean) =>
    setModels((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = baseUrl.trim();

    if (!trimmedName || !trimmedUrl) {
      setSubmitError(t('aiProviders.create.validationRequired'));
      return;
    }

    if (trimmedName.toLowerCase() === 'default') {
      setSubmitError(t('aiProviders.nameReserved'));
      return;
    }

    const cleanModels: CreateAiModelDto[] = models
      .filter((m) => m.name.trim())
      .map((m) => ({
        name: m.name.trim(),
        displayName: m.displayName.trim() || null,
        isDefault: m.isDefault,
      }));

    if (cleanModels.length > 0 && !cleanModels.some((m) => m.isDefault)) {
      cleanModels[0].isDefault = true;
    }

    setSubmitError(null);

    try {
      // 'stored' mode creates a unified credential (type='key') and links it.
      let credentialId: number | null = null;
      if (apiKeyMode === 'stored' && apiKey.trim()) {
        const created = await createCredential.mutateAsync({
          label: `${trimmedName} key`,
          type: 'key' as const,
          secret: apiKey.trim(),
        });
        credentialId = created.id;
      }
      const created = await createProvider.mutateAsync({
        name: trimmedName,
        type,
        baseUrl: trimmedUrl,
        credentialId,
        apiKeyEnvVar: apiKeyMode === 'envvar' ? apiKeyEnvVar.trim() || null : null,
        isDefault: isDefaultProvider,
        iconUrl: selectedDiscovered ? providerIcon(selectedDiscovered.icon, selectedDiscovered.repoPath) : null,
        iconDarkUrl: selectedDiscovered ? providerIcon(selectedDiscovered.iconDark, selectedDiscovered.repoPath) : null,
        models: cleanModels.length > 0 ? cleanModels : undefined,
      });
      resetForm();
      onCreated(created.id);
      navigate(`/ai-providers/${encodeURIComponent(created.slug)}`);
      onClose();
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : t('common.error'));
    }
  };

  const resetForm = () => {
    setStep(hasDiscovered ? 1 : 2);
    setName('');
    setType('openai');
    setBaseUrl('');
    setApiKeyMode('stored');
    setApiKey('');
    setApiKeyEnvVar('');
    setIsDefaultProvider(false);
    setModels([{ name: '', displayName: '', isDefault: true }]);
    setSelectedDiscovered(null);
    setSubmitError(null);
  };

  const stepLabels = hasDiscovered
    ? [t('aiProviders.create.stepChoose'), t('aiProviders.create.stepConfigure')]
    : [t('aiProviders.create.stepConfigure')];

  const stepIndicator = <StepIndicator labels={stepLabels} step={hasDiscovered ? step : 1} />;

  const bodyHeightCls = variant === 'page' ? 'flex-1' : 'h-[460px]';

  // --- Step 1: Discovery grid ---
  const discoveryCards: ChoiceCard[] = [
    ...(discoveredProviders.data ?? []).map((p) => ({
      id: `${p.repoUrl}-${p.repoPath}`,
      icon: p.icon || p.iconDark ? (
        <TemplateIcon
          icon={providerIcon(p.icon, p.repoPath)}
          iconDark={providerIcon(p.iconDark, p.repoPath)}
          className="h-8 w-8"
        />
      ) : (
        <span className="text-sm font-bold uppercase text-muted-foreground">
          {p.displayName.charAt(0)}
        </span>
      ),
      title: p.displayName,
      description: p.description,
    })),
    {
      id: '__manual__',
      icon: <Plus className="h-7 w-7 text-muted-foreground" />,
      title: t('aiProviders.create.manual'),
      dashed: true,
    },
  ];

  const discoveryStep = (
    <div className={`flex ${bodyHeightCls} flex-col`}>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <SectionHeader
          title={t('aiProviders.create.stepChoose')}
          description={t('aiProviders.create.description')}
        />
        <ChoiceGrid
          cards={discoveryCards}
          onSelect={(id) => {
            if (id === '__manual__') {
              selectManual();
            } else {
              const p = discoveredProviders.data?.find((d) => `${d.repoUrl}-${d.repoPath}` === id);
              if (p) selectDiscovered(p);
            }
          }}
          columns={3}
          loading={isLoading}
        />
      </div>
      <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
        <SecondaryButton onClick={onClose}>
          {t('common.close')}
        </SecondaryButton>
        <PrimaryButton disabled={!selectedDiscovered} onClick={() => setStep(2)}>
          {t('agents.create.next')}
          <ChevronRight className="h-4 w-4" />
        </PrimaryButton>
      </div>
    </div>
  );

  // --- Step 2: Configuration form ---
  const formBody = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SectionHeader
        title={selectedDiscovered ? t('aiProviders.create.stepConfigure') : t('aiProviders.create.title')}
        description={selectedDiscovered ? undefined : t('aiProviders.create.description')}
      />

      {selectedDiscovered && (
        <div className="rounded border border-border bg-secondary-item/50 p-3 text-xs text-foreground">
          <div className="flex items-center justify-between">
            <p className="font-medium text-foreground">{selectedDiscovered.displayName}</p>
            {selectedDiscovered.docUrl && (
              <a
                href={selectedDiscovered.docUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:text-primary-soft"
              >
                <ExternalLink className="h-3 w-3" />
                {t('aiProviders.create.getApiKey')}
              </a>
            )}
          </div>
          <p className="mt-1 whitespace-pre-line text-muted-foreground">{selectedDiscovered.description}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('aiProviders.name')}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="openai-prod"
            className={inputCls}
          />
        </Field>
        <Field label={t('aiProviders.type')}>
          <select
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as AiProviderType)}
            className={inputCls}
          >
            {AI_PROVIDER_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {tp}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={t('aiProviders.baseUrl')}>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={PROVIDER_BASE_URL_PRESETS[type] || 'https://...'}
          className={inputCls}
        />
      </Field>

      {/* API key */}
      <div className="space-y-2">
        <Field label={t('aiProviders.apiKey')}>
          <SegmentedControl
            options={[
              { value: 'stored', label: t('aiProviders.apiKeyStored') },
              { value: 'envvar', label: t('aiProviders.apiKeyEnvVar') },
              { value: 'none', label: t('aiProviders.apiKeyNone') },
            ]}
            value={apiKeyMode}
            onChange={setApiKeyMode}
          />
        </Field>
        {apiKeyMode === 'stored' && (
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className={inputCls}
          />
        )}
        {apiKeyMode === 'envvar' && (
          <input
            value={apiKeyEnvVar}
            onChange={(e) => setApiKeyEnvVar(e.target.value)}
            placeholder="OPENAI_API_KEY"
            className={inputCls}
          />
        )}
      </div>

      <ToggleRow
        label={t('aiProviders.defaultProvider')}
        hint={t('aiProviders.setAsDefaultProvider')}
        checked={isDefaultProvider}
        onChange={() => setIsDefaultProvider((v) => !v)}
      />

      {/* Inline models */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('aiProviders.models')}</span>
          <button
            type="button"
            onClick={addModelRow}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-soft"
          >
            <Plus className="h-3 w-3" /> {t('aiProviders.addModel')}
          </button>
        </div>
        {models.map((m, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              value={m.name}
              onChange={(e) => updateModel(idx, 'name', e.target.value)}
              placeholder={t('aiProviders.modelName')}
              className={inputCls + ' flex-1'}
            />
            <input
              value={m.displayName}
              onChange={(e) => updateModel(idx, 'displayName', e.target.value)}
              placeholder={t('aiProviders.modelDisplayName')}
              className={inputCls + ' flex-1'}
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground" title={t('aiProviders.modelDefault')}>
              <input
                type="radio"
                name="default-model"
                checked={m.isDefault}
                onChange={() => setModelDefault(idx)}
                className="accent-primary"
              />
              <Star className={m.isDefault ? 'h-3 w-3 fill-amber-400 text-amber-400' : 'h-3 w-3 text-muted-foreground/50'} />
            </label>
            {models.length > 1 && (
              <button
                type="button"
                onClick={() => removeModelRow(idx)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {submitError && <p className="text-xs text-destructive">{submitError}</p>}

      <div className="flex items-center justify-between gap-2 pt-1">
        {hasDiscovered ? (
          <SecondaryButton onClick={() => setStep(1)}>
            <ChevronLeft className="h-4 w-4" />
            {t('agents.create.back')}
          </SecondaryButton>
        ) : (
          <SecondaryButton onClick={onClose}>
            {t('common.close')}
          </SecondaryButton>
        )}
        <PrimaryButton type="submit" disabled={createProvider.isPending}>
          {createProvider.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('aiProviders.create.submit')}
        </PrimaryButton>
      </div>
    </form>
  );

  if (variant === 'page') {
    return (
      <CreatePage
        title={t('aiProviders.create.title')}
        description={t('aiProviders.create.description')}
        onBack={() => { resetForm(); onClose(); }}
      >
        <div className="flex h-full flex-col">
          <div className="flex-shrink-0 border-b border-border px-4 py-3">{stepIndicator}</div>
          <FormContainer className="flex-1 overflow-y-auto">
            {step === 1 ? discoveryStep : formBody}
          </FormContainer>
        </div>
      </CreatePage>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">{t('aiProviders.create.title')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('aiProviders.create.description')}</p>
        </div>
        <div className="px-4 py-3">{stepIndicator}</div>
        {step === 1 ? (
          <div className="pb-4">{discoveryStep}</div>
        ) : (
          <div className="px-4 pb-4">{formBody}</div>
        )}
      </div>
    </div>
  );
}
