import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Info, Loader2, Plus, RefreshCw } from 'lucide-react';
import { TemplateIcon } from '../templates/TemplateIcon';
import {
  useAgents,
  useCreateAgent,
  useEnsureImageTemplate,
  useImageTemplates,
  useExecuteAgentCommand,
  useUpdateAgentCreationLog,
} from '../../hooks/useAgents';
import { useAiProviders } from '../../hooks/useAiProviders';
import {
  useWorkspaces,
  useCreateWorkspace,
} from '../../hooks/useWorkspaces';
import { useCredentials } from '../../hooks/useCredentials';
import { useUiStore } from '../../store/uiStore';
import { useAgentsMdList } from '../../hooks/useConfig';
import type { CreateWorkspaceDto } from '@codepods/shared-types';
import { InlineWorkspaceForm } from '../workspaces/InlineWorkspaceForm';
import { CreatePage } from '../layout/CreatePage';
import { StepIndicator } from '../ui/StepIndicator';
import { PrimaryButton, SecondaryButton } from '../ui/buttons';
import { ChoiceGrid, type ChoiceCard } from '../ui/ChoiceGrid';
import { FormContainer } from '../ui/FormContainer';
import { SectionHeader } from '../ui/SectionHeader';
import { Field } from '../ui/Field';
import { ToggleRow } from '../ui/ToggleRow';
import { inputCls } from '../ui/styles';

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (agentId: string) => void;
  /** When 'page', renders inline in the content area instead of as an overlay. */
  variant?: 'modal' | 'page';
}

type WsChoice = 'clone-remote' | 'new-remote' | 'new-local' | 'existing' | 'none';

export function CreateAgentModal({
  open,
  onClose,
  onCreated,
  variant = 'modal',
}: CreateAgentModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createAgent = useCreateAgent();
  const ensureImageTemplate = useEnsureImageTemplate();
  const executeCommand = useExecuteAgentCommand();
  const updateCreationLog = useUpdateAgentCreationLog();
  const { data: templates, isLoading: templatesLoading } = useImageTemplates();
  const { data: providers } = useAiProviders();
  const { data: agents } = useAgents();
  const { data: workspaces } = useWorkspaces();
  const createWorkspace = useCreateWorkspace();
  const { data: credentials } = useCredentials();
  const { data: agentsMdList } = useAgentsMdList();
  const { setActiveView, setAutoShowCreationLog } = useUiStore();

  // --- Step state ---
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // --- Step 2 state ---
  const [name, setName] = useState('');
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [setProviderEnabled, setSetProviderEnabled] = useState(true);
  const [gitProxyEnabled, setGitProxyEnabled] = useState(true);
  const [selectedProviderSlug, setSelectedProviderSlug] = useState<string>('default');
  const [selectedModelName, setSelectedModelName] = useState<string>('default');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createPhase, setCreatePhase] = useState<'idle' | 'ensuring' | 'rebuilding' | 'starting' | 'configuring'>('idle');
  const [liveLog, setLiveLog] = useState<string[]>([]);
  const [imageStatus, setImageStatus] = useState<'idle' | 'checking' | 'ready' | 'outdated' | 'building' | 'missing'>('idle');
  const [imageEnsured, setImageEnsured] = useState(false);
  const [allowOutdatedImage, setAllowOutdatedImage] = useState(false);

  // --- Step 3 state (workspace) ---
  const [wsChoice, setWsChoice] = useState<WsChoice>('new-local');
  const [wsId, setWsId] = useState<number | ''>('');
  const [wsRemoteUrl, setWsRemoteUrl] = useState('');
  const [wsName, setWsName] = useState('');
  const [wsNameTouched, setWsNameTouched] = useState(false);
  const [wsCredMode, setWsCredMode] = useState<'existing' | 'new'>('new');
  const [wsCredId, setWsCredId] = useState<number | ''>('');
  const [wsCredUsername, setWsCredUsername] = useState('');
  const [wsCredToken, setWsCredToken] = useState('');
  const [wsGitProvider] = useState<'github' | 'gitlab'>('github');
  const [wsRepoName, setWsRepoName] = useState('');
  const [wsRepoPrivate, setWsRepoPrivate] = useState(true);
  const [wsHideInUse, setWsHideInUse] = useState(true);
  const [wsNoneAck, setWsNoneAck] = useState(false);
  const [copyAgentsMd, setCopyAgentsMd] = useState(true);
  const [agentsMdId, setAgentsMdId] = useState<number | ''>('');

  // Pre-select the default AGENTS.md version when the list loads.
  useEffect(() => {
    if (agentsMdList && agentsMdList.length > 0 && agentsMdId === '') {
      const def = agentsMdList.find((a) => a.isDefault);
      if (def) setAgentsMdId(def.id);
    }
  }, [agentsMdList, agentsMdId]);

  const ts = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const existingNames = React.useMemo(() => agents?.map((a) => a.name) ?? [], [agents]);

  const usedWorkspaceIds = React.useMemo(() => {
    const ids = new Set<number>();
    for (const a of agents ?? []) {
      if (a.workspaceId != null) ids.add(a.workspaceId);
    }
    return ids;
  }, [agents]);

  const availableWorkspaces = React.useMemo(() => {
    if (!workspaces) return [];
    if (!wsHideInUse) return workspaces;
    return workspaces.filter((ws) => !usedWorkspaceIds.has(ws.id));
  }, [workspaces, wsHideInUse, usedWorkspaceIds]);

  const enabledTemplates = React.useMemo(() => {
    if (!templates) return [];
    const lastUsedByTemplate = new Map<number, number>();
    for (const a of agents ?? []) {
      if (a.imageTemplateId == null) continue;
      const ts = new Date(a.createdAt).getTime();
      const prev = lastUsedByTemplate.get(a.imageTemplateId);
      if (prev === undefined || ts > prev) lastUsedByTemplate.set(a.imageTemplateId, ts);
    }
    return templates
      .filter((t) => t.enabled)
      .sort((a, b) => {
        const aUsed = lastUsedByTemplate.get(a.id) ?? 0;
        const bUsed = lastUsedByTemplate.get(b.id) ?? 0;
        if (aUsed !== bUsed) return bUsed - aUsed;
        return a.name.localeCompare(b.name);
      });
  }, [templates, agents]);

  const totalSlots = enabledTemplates.length + 1;
  const MAX_VISIBLE = 9;
  const visibleTemplates = showAllTemplates
    ? enabledTemplates
    : enabledTemplates.slice(0, MAX_VISIBLE - 1);
  const hasMore = totalSlots > MAX_VISIBLE;

  const selectedTemplate = enabledTemplates.find((t) => String(t.id) === selectedTemplateId);
  const hasSetProvider =
    selectedTemplate?.manifest?.commands?.some((c) => c.type === 'set_provider') ?? false;
  const hasStartAgent =
    selectedTemplate?.manifest?.commands?.some((c) => c.type === 'start_agent') ?? false;
  const hasSetGitProxy =
    selectedTemplate?.manifest?.commands?.some((c) => c.type === 'set_git_proxy') ?? false;
  const hasAddMcpServer =
    selectedTemplate?.manifest?.commands?.some((c) => c.type === 'add_mcp_server') ?? false;

  const workspaceEnabled = hasSetGitProxy && gitProxyEnabled;

  const sortedProviders = React.useMemo(() => {
    if (!providers) return [];
    return [...providers]
      .filter((p) => p.enabled)
      .sort(
        (a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name),
      );
  }, [providers]);

  const selectedProvider =
    sortedProviders.find((p) => p.slug === selectedProviderSlug) ?? null;
  const selectedProviderModels = selectedProvider?.models ?? [];

  const defaultProvider = sortedProviders.find((p) => p.isDefault) ?? null;
  const defaultModel = defaultProvider?.models?.find((m) => m.isDefault) ?? defaultProvider?.models?.[0] ?? null;

  React.useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setCreatePhase('idle');
    setNameManuallyEdited(false);
    setShowAllTemplates(false);
    setSelectedTemplateId('');
    setSetProviderEnabled(true);
    setGitProxyEnabled(true);
    setSelectedProviderSlug('default');
    setSelectedModelName('default');
    setStep(1);
    setWsChoice('new-local');
    setWsId('');
    setWsRemoteUrl('');
    setWsName('');
    setWsNameTouched(false);
    setWsCredMode('new');
    setWsCredId('');
    setWsCredUsername('');
    setWsCredToken('');
    setWsRepoName('');
    setWsRepoPrivate(true);
    setWsHideInUse(true);
    setWsNoneAck(false);
    setImageStatus('idle');
    setImageEnsured(false);
    setAllowOutdatedImage(false);
  }, [open]);

  React.useEffect(() => {
    if (!selectedTemplate || nameManuallyEdited) return;
    setName(suggestName(selectedTemplate.name, existingNames));
  }, [selectedTemplate, existingNames, nameManuallyEdited]);

  React.useEffect(() => {
    setSelectedModelName('default');
  }, [selectedProviderSlug]);

  if (!open) return null;

  const handleSelectTemplate = (id: number) => {
    setSelectedTemplateId(String(id));
    setNameManuallyEdited(false);
    setImageStatus('idle');
    setImageEnsured(false);
    setAllowOutdatedImage(false);
    const tmpl = enabledTemplates.find((t) => t.id === id);
    if (tmpl) {
      setName(suggestName(tmpl.name, existingNames));
    }
    // Check image status: up-to-date, outdated, or needs building (checkOnly — no build)
    setImageStatus('checking');
    ensureImageTemplate.mutateAsync({ id, update: false, checkOnly: true })
      .then((result) => {
        if (result.action === 'missing') {
          setImageStatus('missing');
        } else {
          setImageStatus('ready');
          setImageEnsured(true);
        }
      })
      .catch((err: unknown) => {
        if (tryParseOutdatedError(err)) {
          setImageStatus('outdated');
        } else {
          // Build error or other — let creation handle it
          setImageStatus('idle');
        }
      });
  };

  const handleUpdateImage = async () => {
    if (!selectedTemplateId) return;
    setImageStatus('building');
    try {
      await ensureImageTemplate.mutateAsync({ id: parseInt(selectedTemplateId, 10), update: true });
      setImageStatus('ready');
      setImageEnsured(true);
    } catch {
      setImageStatus('outdated');
    }
  };

  const handleKeepOutdatedImage = () => {
    setImageStatus('ready');
    setImageEnsured(true);
    setAllowOutdatedImage(true);
  };

  const handleGoToNewTemplate = () => {
    onClose();
    setActiveView('templates');
    navigate('/agents/templates/new');
  };

  const canAdvanceToStep3 = name.trim() !== '' && !!selectedTemplateId;

  // When the git proxy is disabled the workspace is forced to "none".
  const effectiveWsChoice: WsChoice = workspaceEnabled ? wsChoice : 'none';

  const isRemoteChoice = effectiveWsChoice === 'clone-remote' || effectiveWsChoice === 'new-remote';

  const selectWsChoice = (c: WsChoice) => {
    setWsChoice(c);
    // Auto-select first credential when entering a remote choice
    if ((c === 'clone-remote' || c === 'new-remote') && credentials && credentials.length > 0) {
      setWsCredMode('existing');
      setWsCredId(credentials[0].id);
    }
  };

  const canSubmit = (() => {
    if (effectiveWsChoice === 'none') return !workspaceEnabled || wsNoneAck;
    if (effectiveWsChoice === 'existing') return wsId !== '';
    if (effectiveWsChoice === 'clone-remote') return !!wsRemoteUrl.trim() && !!wsName.trim();
    if (effectiveWsChoice === 'new-remote') return !!wsRepoName.trim() && !!wsName.trim();
    return !!wsName.trim(); // new-local — name required
  })();

  const resolveWorkspaceId = async (): Promise<number | undefined> => {
    if (effectiveWsChoice === 'none') return undefined;
    if (effectiveWsChoice === 'existing') return wsId === '' ? undefined : Number(wsId);
    // Name is required — user must enter it or click "use suggested name"
    const effectiveName = wsName.trim();
    if (!effectiveName) return undefined;
    const dto: CreateWorkspaceDto = {
      type: effectiveWsChoice === 'new-remote' ? 'remote' : effectiveWsChoice === 'clone-remote' ? 'remote' : 'local',
      remoteUrl: effectiveWsChoice === 'clone-remote' ? wsRemoteUrl.trim() : undefined,
      name: effectiveName,
      gitProvider: effectiveWsChoice === 'new-remote' ? wsGitProvider : undefined,
      repoName: effectiveWsChoice === 'new-remote' ? wsRepoName.trim() : undefined,
      repoPrivate: effectiveWsChoice === 'new-remote' ? wsRepoPrivate : undefined,
      credentialId:
        isRemoteChoice && wsCredMode === 'existing' && wsCredId !== ''
          ? Number(wsCredId)
          : null,
      credential:
        isRemoteChoice && wsCredMode === 'new'
          ? { username: wsCredUsername.trim(), token: wsCredToken.trim() }
          : undefined,
      copyAgentsMd,
      agentsMdId: agentsMdId === '' ? null : agentsMdId,
    };
    const created = await createWorkspace.mutateAsync(dto);
    return created.id;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName || !selectedTemplateId) {
      setSubmitError(t('agents.create.validationRequired'));
      return;
    }

    // When workspace is disabled, force "none" choice
    if (effectiveWsChoice === 'none' && !workspaceEnabled) {
      // Workspace disabled — no ack needed, proceed directly
    } else if (effectiveWsChoice === 'none' && !wsNoneAck) {
      setSubmitError(t('agents.create.workspaceNoneWarning'));
      return;
    }
    if (effectiveWsChoice === 'existing' && wsId === '') {
      setSubmitError(t('agents.create.workspaceSelectPlaceholder'));
      return;
    }
    if (effectiveWsChoice === 'clone-remote' && !wsRemoteUrl.trim()) {
      setSubmitError(t('workspaces.create.validationRequired'));
      return;
    }
    if (effectiveWsChoice === 'new-remote' && !wsRepoName.trim()) {
      setSubmitError(t('workspaces.create.validationRequired'));
      return;
    }
    if (effectiveWsChoice !== 'none' && effectiveWsChoice !== 'existing' && !wsName.trim()) {
      setSubmitError(t('agents.create.workspaceNameRequired'));
      return;
    }
    const effectiveIsRemote = effectiveWsChoice === 'clone-remote' || effectiveWsChoice === 'new-remote';
    if (effectiveIsRemote && wsCredMode === 'new' && (!wsCredUsername.trim() || !wsCredToken.trim())) {
      setSubmitError(t('workspaces.createCred.validationRequired'));
      return;
    }

    setSubmitError(null);
    setLiveLog([]);
    const templateId = parseInt(selectedTemplateId, 10);
    const log: string[] = [];
    const appendEvent = (msg: string) => { const line = `[${ts()}] → ${msg}`; log.push(line); setLiveLog([...log]); };
    const appendOutput = (lines: string[]) => { log.push(...lines); setLiveLog([...log]); };

    const runSetProvider = async (agentId: string) => {
      if (!hasSetProvider || !setProviderEnabled) return;
      setCreatePhase('configuring');
      appendEvent(t('agents.create.logConfiguring'));
      try {
        const result = await executeCommand.mutateAsync({
          id: agentId,
          dto: {
            type: 'set_provider',
            providerSlug: selectedProviderSlug,
            modelName: selectedModelName,
          },
        });
        if (result.commandOutput) {
          appendOutput([`  ${t('agents.create.logSetProviderOutput')}`, ...result.commandOutput!.split('\n')]);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : t('agents.commandFailed');
        appendOutput([`  ${t('agents.create.logSetProviderError')} ${errMsg}`]);
      }
    };

    const runStartAgent = async (agentId: string) => {
      if (!hasStartAgent) return;
      appendEvent(t('agents.create.logStartingAgent'));
      try {
        const result = await executeCommand.mutateAsync({
          id: agentId,
          dto: { type: 'start_agent' },
        });
        if (result.commandOutput) {
          appendOutput([`  ${t('agents.create.logStartAgentOutput')}`, ...result.commandOutput!.split('\n')]);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : t('agents.commandFailed');
        appendOutput([`  ${t('agents.create.logStartAgentError')} ${errMsg}`]);
      }
    };

    const runSetGitProxy = async (agentId: string) => {
      if (!hasSetGitProxy || !gitProxyEnabled) return;
      appendEvent(t('agents.create.logGitProxy'));
      try {
        const result = await executeCommand.mutateAsync({
          id: agentId,
          dto: { type: 'set_git_proxy' },
        });
        if (result.commandOutput) {
          appendOutput([`  ${t('agents.create.logGitProxyOutput')}`, ...result.commandOutput!.split('\n')]);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : t('agents.commandFailed');
        appendOutput([`  ${t('agents.create.logGitProxyError')} ${errMsg}`]);
      }
    };

    const finishLog = async (agentId: string) => {
      appendEvent(t('agents.create.logComplete'));
      await updateCreationLog.mutateAsync({ id: agentId, creationLog: log.join('\n') });
    };

    const doCreate = async (workspaceId: number | undefined) => {
      if (!imageEnsured) {
        setCreatePhase('ensuring');
        appendEvent(t('agents.create.logEnsuring'));
        const ensureResult = await ensureImageTemplate.mutateAsync({ id: templateId, update: false });
        appendOutput(ensureResult.buildOutput ?? []);
      }
      setCreatePhase('starting');
      appendEvent(t('agents.create.logCreating'));
      const created = await createAgent.mutateAsync({
        name: trimmedName,
        imageTemplateId: templateId,
        updateImageIfOutdated: false,
        allowOutdatedImage,
        codepodId: 1,
        ...(workspaceId !== undefined ? { workspaceId } : {}),
      });

      await runSetProvider(created.id);
      await runSetGitProxy(created.id);
      // MCP servers flagged "connect all agents" are auto-connected by the
      // backend during agent creation — no explicit command needed here.
      await runStartAgent(created.id);
      await finishLog(created.id);
      onClose();
      setNameManuallyEdited(false);
      setCreatePhase('idle');
      navigate(`/agents/${encodeURIComponent(created.name)}`);
    };

    try {
      let workspaceId: number | undefined;
      if (effectiveWsChoice !== 'none') {
        appendEvent(effectiveWsChoice === 'existing' ? 'Linking workspace...' : 'Creating workspace...');
        workspaceId = await resolveWorkspaceId();
      }
      await doCreate(workspaceId);
    } catch (error: unknown) {
      const outdated = tryParseOutdatedError(error);
      if (outdated && window.confirm(t('agents.create.confirmUpdateImage'))) {
        setCreatePhase('rebuilding');
        appendEvent(t('agents.create.logRebuilding'));
        try {
          const rebuildResult = await ensureImageTemplate.mutateAsync({ id: templateId, update: true });
          appendOutput(rebuildResult.buildOutput ?? []);
          const workspaceId = effectiveWsChoice === 'existing' && wsId !== '' ? Number(wsId) : undefined;
          setCreatePhase('starting');
          appendEvent(t('agents.create.logCreating'));
          const created = await createAgent.mutateAsync({
            name: trimmedName,
            imageTemplateId: templateId,
            updateImageIfOutdated: false,
            allowOutdatedImage,
            codepodId: 1,
            ...(workspaceId !== undefined ? { workspaceId } : {}),
          });

          await runSetProvider(created.id);
          await runSetGitProxy(created.id);
          // MCP servers flagged "connect all agents" are auto-connected by the
          // backend during agent creation — no explicit command needed here.
          await runStartAgent(created.id);
          await finishLog(created.id);
          setAutoShowCreationLog(true);
          onCreated(created.id);
          onClose();
          setNameManuallyEdited(false);
          setCreatePhase('idle');
          navigate(`/agents/${encodeURIComponent(created.name)}`);
          return;
        } catch (retryError: unknown) {
          setCreatePhase('idle');
          const parsed = parseApiErrorPayload(retryError);
          setSubmitError(parsed?.message ?? (retryError instanceof Error ? retryError.message : t('common.error')));
          return;
        }
      }

      setCreatePhase('idle');
      const parsed = parseApiErrorPayload(error);
      setSubmitError(parsed?.message ?? (error instanceof Error ? error.message : t('common.error')));
    }
  };

  const isBusy =
    createAgent.isPending || ensureImageTemplate.isPending || executeCommand.isPending || createWorkspace.isPending;

  const stepLabels = [
    t('agents.create.stepTemplate'),
    t('agents.create.stepConfig'),
    t('agents.create.stepWorkspace'),
    t('agents.create.stepDetails'),
  ];

  const stepIndicator = <StepIndicator labels={stepLabels} step={step} />;

  const bodyHeightCls = variant === 'page' ? 'flex-1' : 'h-[460px]';

  const stepContent = (
    <>
      {step === 1 && (
        /* --- Step 1: Template selection grid --- */
        <div className={`flex ${bodyHeightCls} flex-col`}>
            <FormContainer className="flex-1 space-y-4 overflow-y-auto">
            <SectionHeader
              title={t('agents.create.stepTemplate')}
              description={t('agents.create.stepTemplateHint')}
            />
            <ChoiceGrid
              cards={[
                ...visibleTemplates.map((tmpl) => ({
                  id: String(tmpl.id),
                  icon: (
                    <TemplateIcon
                      icon={tmpl.icon}
                      iconDark={tmpl.iconDark}
                      className="h-8 w-8"
                    />
                  ),
                  title: tmpl.name,
                })),
                {
                  id: '__new__',
                  icon: <Plus className="h-7 w-7 text-muted-foreground" />,
                  title: t('agents.create.customTemplate'),
                  dashed: true,
                },
              ] satisfies ChoiceCard[]}
              onSelect={(id) => {
                if (id === '__new__') {
                  handleGoToNewTemplate();
                } else {
                  handleSelectTemplate(Number(id));
                }
              }}
              selectedId={selectedTemplateId}
              columns={3}
              loading={templatesLoading}
              emptyHint={t('agents.create.noTemplatesHint')}
              collapseAt={hasMore ? MAX_VISIBLE - 1 : undefined}
              showAll={showAllTemplates}
              onToggleShowAll={hasMore ? () => setShowAllTemplates((v) => !v) : undefined}
              showMoreLabel={t('agents.create.showMore')}
              showLessLabel={t('agents.create.showLess')}
            />
            </FormContainer>
            <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
              <SecondaryButton onClick={onClose}>
                {t('common.cancel')}
              </SecondaryButton>
              <PrimaryButton disabled={!selectedTemplateId} onClick={() => setStep(2)}>
                {t('agents.create.next')}
                <ChevronRight className="h-4 w-4" />
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === 2 && (
          /* --- Step 2: Configuration form --- */
          <form
            onSubmit={(e) => { e.preventDefault(); setStep(3); }}
            className={`flex ${bodyHeightCls} flex-col`}
          >
            <FormContainer className="flex-1 space-y-4 overflow-y-auto">
            <SectionHeader
              title={t('agents.create.stepConfig')}
              description={t('agents.create.stepConfigHint')}
            />
            <Field label={t('agents.create.nameLabel')}>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameManuallyEdited(true);
                }}
                placeholder={t('agents.create.namePlaceholder')}
                className={inputCls}
              />
            </Field>

            {/* Image status indicator */}
            {imageStatus === 'checking' && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary-item/50 p-2.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t('agents.create.ensureImageRunning')}</span>
              </div>
            )}
            {imageStatus === 'outdated' && (
              <div className="space-y-2 rounded-lg border border-amber-700/50 bg-amber-900/10 p-2.5">
                <p className="text-xs text-amber-300">{t('agents.create.ensureImageSuggestion')}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUpdateImage}
                    className="inline-flex items-center gap-1.5 rounded border border-amber-600/50 bg-amber-600/10 px-2.5 py-1 text-xs text-amber-300 transition-colors hover:bg-amber-600/20"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('agents.create.updateImageButton')}
                  </button>
                  <button
                    type="button"
                    onClick={handleKeepOutdatedImage}
                    className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary-item"
                  >
                    {t('agents.create.keepCurrentImage')}
                  </button>
                </div>
              </div>
            )}
            {imageStatus === 'building' && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary-item/50 p-2.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t('agents.create.imageBuilding')}</span>
              </div>
            )}
            {imageStatus === 'missing' && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-700/50 bg-blue-900/10 p-2.5">
                <Info className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs text-blue-300">{t('agents.create.imageMissing')}</span>
              </div>
            )}
            {imageStatus === 'ready' && allowOutdatedImage && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary-item/50 p-2.5">
                <span className="text-xs text-muted-foreground">{t('agents.create.usingOutdatedImage')}</span>
              </div>
            )}

            <div className="space-y-1">
              <SectionHeader title={t('agents.create.setProvider')} size="sm" />
              {hasSetProvider ? (
                <>
                  <ToggleRow
                    label={t('agents.create.setProviderHint')}
                    checked={setProviderEnabled}
                    onChange={() => setSetProviderEnabled((v) => !v)}
                  />
                  {setProviderEnabled && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <Field label={t('agents.provider')}>
                        <select
                          value={selectedProviderSlug}
                          onChange={(e) => setSelectedProviderSlug(e.target.value)}
                          className={inputCls}
                        >
                          <option value="default">
                            {defaultProvider
                              ? `${t('agents.defaultProvider')} (${defaultProvider.name})`
                              : t('agents.defaultProvider')}
                          </option>
                          {sortedProviders.map((p) => (
                            <option key={p.id} value={p.slug}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t('agents.model')}>
                        <select
                          value={selectedModelName}
                          onChange={(e) => setSelectedModelName(e.target.value)}
                          className={inputCls}
                        >
                          <option value="default">
                            {defaultModel
                              ? `${t('agents.defaultModel')} (${defaultModel.displayName ?? defaultModel.name})`
                              : t('agents.defaultModel')}
                          </option>
                          {selectedProviderModels.map((m) => (
                            <option key={m.id} value={m.name}>
                              {m.displayName ?? m.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-amber-300">{t('agents.create.setProviderNotSupported')}</p>
              )}
            </div>

            <div className="space-y-1">
              <SectionHeader title={t('agents.create.setGitProxy')} size="sm" />
              {hasSetGitProxy ? (
                <ToggleRow
                  label={t('agents.create.gitProxyCheckbox')}
                  hint={
                    gitProxyEnabled
                      ? t('agents.create.gitProxyDetail')
                      : t('agents.create.gitProxyDisabledWarning')
                  }
                  checked={gitProxyEnabled}
                  onChange={() => setGitProxyEnabled((v) => !v)}
                />
              ) : (
                <p className="text-xs text-amber-300">{t('agents.create.gitProxyNotSupported')}</p>
              )}
            </div>

            <div className="space-y-1">
              <SectionHeader title={t('agents.create.setMcpServer')} size="sm" />
              <p className={hasAddMcpServer ? 'text-xs text-muted-foreground' : 'text-xs text-amber-300'}>
                {hasAddMcpServer ? t('agents.create.mcpAutoConnectInfo') : t('agents.create.mcpNotSupported')}
              </p>
            </div>

            {submitError && <p className="text-xs text-destructive">{submitError}</p>}
            </FormContainer>

            <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
              <SecondaryButton onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4" />
                {t('agents.create.back')}
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={!canAdvanceToStep3}>
                {t('agents.create.next')}
                <ChevronRight className="h-4 w-4" />
              </PrimaryButton>
            </div>
          </form>
        )}

        {step === 3 && (
          /* --- Step 3: Workspace choice --- */
          <form onSubmit={(e) => { e.preventDefault(); setStep(4); }} className={`flex ${bodyHeightCls} flex-col`}>
            <FormContainer className="flex-1 space-y-4 overflow-y-auto">
              <SectionHeader
                title={t('agents.create.stepWorkspace')}
                description={
                  workspaceEnabled
                    ? t('agents.create.workspaceStepHint')
                    : !hasSetGitProxy
                      ? t('agents.create.gitProxyNotSupportedWarning')
                      : t('agents.create.gitProxyDisabledWarning')
                }
              />

              <ChoiceGrid
                cards={[
                  { value: 'clone-remote', title: t('agents.create.choiceCloneRemote'), desc: t('agents.create.choiceCloneRemoteDesc') },
                  { value: 'new-remote', title: t('agents.create.choiceNewRemote'), desc: t('agents.create.choiceNewRemoteDesc') },
                  { value: 'new-local', title: t('agents.create.choiceNewLocal'), desc: t('agents.create.choiceNewLocalDesc') },
                  { value: 'existing', title: t('agents.create.choiceExisting'), desc: t('agents.create.choiceExistingDesc') },
                  { value: 'none', title: t('agents.create.choiceNone'), desc: t('agents.create.choiceNoneDesc') },
                ].map((opt) => ({
                  id: opt.value,
                  title: opt.title,
                  description: opt.desc,
                  disabled: !workspaceEnabled && opt.value !== 'none',
                })) satisfies ChoiceCard[]}
                onSelect={(id) => selectWsChoice(id as WsChoice)}
                selectedId={workspaceEnabled ? wsChoice : 'none'}
                columns={1}
                cardLayout="horizontal"
              />
            </FormContainer>

            <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
              <SecondaryButton onClick={() => setStep(2)} disabled={isBusy}>
                <ChevronLeft className="h-4 w-4" />
                {t('agents.create.back')}
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={isBusy}>
                {t('agents.create.next')}
                <ChevronRight className="h-4 w-4" />
              </PrimaryButton>
            </div>
          </form>
        )}

        {step === 4 && (
          /* --- Step 4: Workspace details / form --- */
          <form onSubmit={handleSubmit} className={`flex ${bodyHeightCls} flex-col`}>
            <FormContainer className="flex-1 space-y-4 overflow-y-auto">
            <SectionHeader
              title={t('agents.create.stepDetails')}
              description={
                effectiveWsChoice === 'clone-remote' ? t('agents.create.choiceCloneRemote')
                  : effectiveWsChoice === 'new-remote' ? t('agents.create.choiceNewRemote')
                  : effectiveWsChoice === 'new-local' ? t('agents.create.choiceNewLocal')
                  : effectiveWsChoice === 'existing' ? t('agents.create.choiceExisting')
                  : t('agents.create.choiceNone')
              }
            />

            {/* Clone existing remote */}
            {effectiveWsChoice === 'clone-remote' && (
              <InlineWorkspaceForm
                type="remote"
                hideTypeToggle
                remoteUrl={wsRemoteUrl}
                onRemoteUrlChange={setWsRemoteUrl}
                name={wsName}
                onNameChange={(v) => { setWsName(v); setWsNameTouched(true); }}
                nameTouched={wsNameTouched}
                credMode={wsCredMode}
                onCredModeChange={setWsCredMode}
                credentialId={wsCredId}
                onCredentialIdChange={setWsCredId}
                credUsername={wsCredUsername}
                onCredUsernameChange={setWsCredUsername}
                credToken={wsCredToken}
                onCredTokenChange={setWsCredToken}
                credentials={credentials}
                suggestedName={name.trim() ? `${name.trim()}-workspace` : undefined}
              />
            )}

            {/* New remote (GitHub) */}
            {effectiveWsChoice === 'new-remote' && (
              <InlineWorkspaceForm
                type="new-remote"
                hideTypeToggle
                remoteUrl=""
                onRemoteUrlChange={() => {}}
                name={wsName}
                onNameChange={(v) => { setWsName(v); setWsNameTouched(true); }}
                nameTouched={wsNameTouched}
                credMode={wsCredMode}
                onCredModeChange={setWsCredMode}
                credentialId={wsCredId}
                onCredentialIdChange={setWsCredId}
                credUsername={wsCredUsername}
                onCredUsernameChange={setWsCredUsername}
                credToken={wsCredToken}
                onCredTokenChange={setWsCredToken}
                credentials={credentials}
                gitProvider={wsGitProvider}
                onGitProviderChange={() => {}}
                repoName={wsRepoName}
                onRepoNameChange={setWsRepoName}
                repoPrivate={wsRepoPrivate}
                onRepoPrivateChange={setWsRepoPrivate}
                suggestedName={name.trim() ? `${name.trim()}-workspace` : undefined}
              />
            )}

            {/* New local */}
            {effectiveWsChoice === 'new-local' && (
              <InlineWorkspaceForm
                type="local"
                hideTypeToggle
                remoteUrl=""
                onRemoteUrlChange={() => {}}
                name={wsName}
                onNameChange={(v) => { setWsName(v); setWsNameTouched(true); }}
                nameTouched={wsNameTouched}
                credMode="new"
                onCredModeChange={() => {}}
                credentialId=""
                onCredentialIdChange={() => {}}
                credUsername=""
                onCredUsernameChange={() => {}}
                credToken=""
                onCredTokenChange={() => {}}
                credentials={credentials}
                suggestedName={name.trim() ? `${name.trim()}-workspace` : undefined}
              />
            )}

            {/* Existing workspace picker */}
            {effectiveWsChoice === 'existing' && (
              <div className="space-y-3">
                <ToggleRow
                  label={t('agents.create.workspaceHideInUse')}
                  checked={wsHideInUse}
                  onChange={() => setWsHideInUse((v) => !v)}
                />
                {workspaces && workspaces.length > 0 ? (
                  availableWorkspaces.length > 0 ? (
                    <Field label={t('agents.create.workspaceExisting')}>
                      <select
                        value={wsId}
                        onChange={(e) => setWsId(e.target.value === '' ? '' : Number(e.target.value))}
                        className={inputCls}
                      >
                        <option value="">{t('agents.create.workspaceSelectPlaceholder')}</option>
                        {availableWorkspaces.map((ws) => (
                          <option key={ws.id} value={ws.id}>
                            {ws.name} ({ws.type})
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t('agents.create.workspaceNoWorkspaces')}</p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">{t('agents.create.workspaceNoWorkspaces')}</p>
                )}
              </div>
            )}

            {/* None — warning + acknowledgement */}
            {effectiveWsChoice === 'none' && (
              <div className="space-y-2 rounded-lg border border-amber-700/50 bg-amber-900/10 p-3">
                <p className="text-xs text-amber-300">{t('agents.create.workspaceNoneWarning')}</p>
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={wsNoneAck}
                    onChange={(e) => setWsNoneAck(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border bg-secondary-item"
                  />
                  {t('agents.create.workspaceNoneAck')}
                </label>
              </div>
            )}

            {/* Copy AGENTS.md — shown when creating a new workspace */}
            {effectiveWsChoice !== 'none' && effectiveWsChoice !== 'existing' && (
              <div className="space-y-3 border-t border-border/50 pt-3">
                <ToggleRow
                  label={t('agents.create.copyAgentsMdTitle')}
                  hint={t('agents.create.copyAgentsMd')}
                  checked={copyAgentsMd}
                  onChange={() => setCopyAgentsMd((v) => !v)}
                />
                {copyAgentsMd && agentsMdList && agentsMdList.length > 0 && (
                  <Field label={t('agents.create.agentsMdVersion')}>
                    <select
                      value={agentsMdId}
                      onChange={(e) => setAgentsMdId(e.target.value === '' ? '' : Number(e.target.value))}
                      className={inputCls}
                    >
                      {agentsMdList.map((am) => (
                        <option key={am.id} value={am.id}>
                          {am.alias}
                          {am.isDefault ? ` (${t('agentsMd.default')})` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
            )}

            {submitError && <p className="text-xs text-destructive">{submitError}</p>}
            {createPhase !== 'idle' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {createPhase === 'ensuring' && t('agents.create.progressEnsuringImage')}
                  {createPhase === 'rebuilding' && t('agents.create.progressRebuildingImage')}
                  {createPhase === 'starting' && t('agents.create.progressStartingContainer')}
                  {createPhase === 'configuring' && t('agents.executing')}
                </p>
                {liveLog.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded bg-background/80 border border-border p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {liveLog.map((line, i) => <div key={i}>{line}</div>)}
                  </div>
                )}
              </div>
            )}

            </FormContainer>

            <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
              <SecondaryButton onClick={() => setStep(3)} disabled={isBusy}>
                <ChevronLeft className="h-4 w-4" />
                {t('agents.create.back')}
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={isBusy || !canSubmit}>
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('agents.create.submit')}
              </PrimaryButton>
            </div>
          </form>
        )}
    </>
  );

  if (variant === 'page') {
    return (
      <CreatePage
        title={t('agents.create.title')}
        description={t('agents.create.description')}
        onBack={onClose}
      >
        <div className="flex h-full flex-col">
          <div className="flex-shrink-0 border-b border-border px-4 py-3">{stepIndicator}</div>
          {stepContent}
        </div>
      </CreatePage>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">{t('agents.create.title')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('agents.create.description')}</p>
          <div className="mt-3">{stepIndicator}</div>
        </div>
        {stepContent}
      </div>
    </div>
  );
}

function suggestName(type: string, existingNames: string[]): string {
  const used = new Set<number>();
  const prefix = `${type}-`;
  for (const existing of existingNames) {
    if (!existing.startsWith(prefix)) continue;
    const suffix = existing.slice(prefix.length);
    const n = parseInt(suffix, 10);
    if (!Number.isNaN(n) && String(n) === suffix) {
      used.add(n);
    }
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `${type}-${n}`;
}

function tryParseOutdatedError(error: unknown): boolean {
  const payload = parseApiErrorPayload(error);
  return payload?.code === 'IMAGE_OUTDATED';
}

function parseApiErrorPayload(error: unknown): { code?: string; message?: string; buildOutput?: string[] } | null {
  if (!(error instanceof Error)) return null;
  if (!error.message.startsWith('API ')) return null;
  const separator = ': ';
  const idx = error.message.indexOf(separator);
  if (idx < 0) return null;
  try {
    return JSON.parse(error.message.slice(idx + separator.length)) as {
      code?: string;
      message?: string;
      buildOutput?: string[];
    };
  } catch {
    return null;
  }
}
