import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCreateWorkspace } from '../../hooks/useWorkspaces';
import { useCredentials } from '../../hooks/useCredentials';
import { useAgentsMdList } from '../../hooks/useConfig';
import { InlineWorkspaceForm } from './InlineWorkspaceForm';
import type { CreateWorkspaceDto, GitProviderType } from '@codepods/shared-types';
import { CreatePage } from '../layout/CreatePage';
import { StepIndicator } from '../ui/StepIndicator';
import { PrimaryButton, SecondaryButton } from '../ui/buttons';
import { ChoiceGrid, type ChoiceCard } from '../ui/ChoiceGrid';
import { FormContainer } from '../ui/FormContainer';
import { SectionHeader } from '../ui/SectionHeader';
import { Field } from '../ui/Field';
import { ToggleRow } from '../ui/ToggleRow';
import { inputCls } from '../ui/styles';

type WsChoice = 'clone-remote' | 'new-remote' | 'new-local';

interface CreateWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (workspaceId: number) => void;
  /** When 'page', renders inline in the content area instead of as an overlay. */
  variant?: 'modal' | 'page';
}

export function CreateWorkspaceModal({
  open,
  onClose,
  onCreated,
  variant = 'modal',
}: CreateWorkspaceModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createWorkspace = useCreateWorkspace();
  const { data: credentials } = useCredentials();
  const { data: agentsMdList } = useAgentsMdList();

  const [step, setStep] = useState<1 | 2>(1);
  const [choice, setChoice] = useState<WsChoice>('new-local');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [credMode, setCredMode] = useState<'existing' | 'new'>('new');
  const [credId, setCredId] = useState<number | ''>('');
  const [credUsername, setCredUsername] = useState('');
  const [credToken, setCredToken] = useState('');
  const [gitProvider] = useState<GitProviderType>('github');
  const [repoName, setRepoName] = useState('');
  const [repoPrivate, setRepoPrivate] = useState(true);
  const [copyAgentsMd, setCopyAgentsMd] = useState(true);
  const [agentsMdId, setAgentsMdId] = useState<number | ''>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pre-select the default AGENTS.md version when the list loads.
  useEffect(() => {
    if (agentsMdList && agentsMdList.length > 0 && agentsMdId === '') {
      const def = agentsMdList.find((a) => a.isDefault);
      if (def) setAgentsMdId(def.id);
    }
  }, [agentsMdList, agentsMdId]);

  if (!open) return null;

  const isRemote = choice === 'clone-remote' || choice === 'new-remote';

  const resetForm = () => {
    setStep(1);
    setChoice('new-local');
    setRemoteUrl('');
    setName('');
    setNameTouched(false);
    setCredMode('new');
    setCredId('');
    setCredUsername('');
    setCredToken('');
    setRepoName('');
    setRepoPrivate(true);
    setCopyAgentsMd(true);
    setAgentsMdId('');
    setSubmitError(null);
  };

  const close = () => {
    resetForm();
    onClose();
  };

  const selectChoice = (c: WsChoice) => {
    setChoice(c);
    if ((c === 'clone-remote' || c === 'new-remote') && credentials && credentials.length > 0) {
      setCredMode('existing');
      setCredId(credentials[0].id);
    }
  };

  const canSubmit = (() => {
    if (choice === 'clone-remote') return !!remoteUrl.trim();
    if (choice === 'new-remote') return !!repoName.trim();
    return true; // local — the name is derived automatically
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (choice === 'clone-remote' && !remoteUrl.trim()) {
      setSubmitError(t('workspaces.create.validationRequired'));
      return;
    }
    if (choice === 'new-remote' && !repoName.trim()) {
      setSubmitError(t('workspaces.create.validationRequired'));
      return;
    }
    if (isRemote && credMode === 'new' && (!credUsername.trim() || !credToken.trim())) {
      setSubmitError(t('workspaces.createCred.validationRequired'));
      return;
    }
    try {
      const dto: CreateWorkspaceDto = {
        type: choice === 'new-local' ? 'local' : 'remote',
        remoteUrl: choice === 'clone-remote' ? remoteUrl.trim() : undefined,
        name: name.trim() || undefined,
        gitProvider: choice === 'new-remote' ? gitProvider : undefined,
        repoName: choice === 'new-remote' ? repoName.trim() : undefined,
        repoPrivate: choice === 'new-remote' ? repoPrivate : undefined,
        credentialId: isRemote && credMode === 'existing' && credId !== '' ? Number(credId) : null,
        credential:
          isRemote && credMode === 'new'
            ? { username: credUsername.trim(), token: credToken.trim() }
            : undefined,
        copyAgentsMd,
        agentsMdId: agentsMdId === '' ? null : agentsMdId,
      };
      const created = await createWorkspace.mutateAsync(dto);
      resetForm();
      onCreated(created.id);
      navigate(`/workspaces/${encodeURIComponent(created.slug)}`);
      onClose();
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : t('common.error'));
    }
  };

  const stepLabels = [t('agents.create.stepWorkspace'), t('agents.create.stepDetails')];

  const wsChoiceCards: ChoiceCard[] = [
    {
      id: 'clone-remote',
      title: t('agents.create.choiceCloneRemote'),
      description: t('agents.create.choiceCloneRemoteDesc'),
    },
    {
      id: 'new-remote',
      title: t('agents.create.choiceNewRemote'),
      description: t('agents.create.choiceNewRemoteDesc'),
    },
    {
      id: 'new-local',
      title: t('agents.create.choiceNewLocal'),
      description: t('agents.create.choiceNewLocalDesc'),
    },
  ];

  const selectedChoiceTitle =
    choice === 'clone-remote'
      ? t('agents.create.choiceCloneRemote')
      : choice === 'new-remote'
        ? t('agents.create.choiceNewRemote')
        : t('agents.create.choiceNewLocal');

  const footerCls = 'flex items-center justify-between border-t border-border/50 px-4 py-3';

  const stepOneBody = (
    <div className="flex flex-1 flex-col">
      <FormContainer className="flex-1 space-y-4 overflow-y-auto">
        <SectionHeader
          title={t('agents.create.stepWorkspace')}
          description={t('agents.create.workspaceStepHint')}
        />
        <ChoiceGrid
          cards={wsChoiceCards}
          onSelect={(id) => selectChoice(id as WsChoice)}
          selectedId={choice}
          columns={1}
          cardLayout="horizontal"
        />
      </FormContainer>
      <div className={footerCls}>
        <SecondaryButton onClick={close}>{t('common.cancel')}</SecondaryButton>
        <PrimaryButton onClick={() => setStep(2)}>
          {t('agents.create.next')}
          <ChevronRight className="h-4 w-4" />
        </PrimaryButton>
      </div>
    </div>
  );

  const stepTwoBody = (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <FormContainer className="flex-1 space-y-4 overflow-y-auto">
        <SectionHeader
          title={t('agents.create.stepDetails')}
          description={selectedChoiceTitle}
        />

        <InlineWorkspaceForm
          type={choice === 'new-local' ? 'local' : choice === 'new-remote' ? 'new-remote' : 'remote'}
          hideTypeToggle
          remoteUrl={remoteUrl}
          onRemoteUrlChange={setRemoteUrl}
          name={name}
          onNameChange={(v) => {
            setName(v);
            setNameTouched(true);
          }}
          nameTouched={nameTouched}
          credMode={credMode}
          onCredModeChange={setCredMode}
          credentialId={credId}
          onCredentialIdChange={setCredId}
          credUsername={credUsername}
          onCredUsernameChange={setCredUsername}
          credToken={credToken}
          onCredTokenChange={setCredToken}
          credentials={credentials}
          gitProvider={gitProvider}
          onGitProviderChange={() => {}}
          repoName={repoName}
          onRepoNameChange={setRepoName}
          repoPrivate={repoPrivate}
          onRepoPrivateChange={setRepoPrivate}
        />

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

        {submitError && <p className="text-xs text-destructive">{submitError}</p>}
      </FormContainer>

      <div className={footerCls}>
        <SecondaryButton onClick={() => setStep(1)} disabled={createWorkspace.isPending}>
          <ChevronLeft className="h-4 w-4" />
          {t('agents.create.back')}
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={createWorkspace.isPending || !canSubmit}>
          {createWorkspace.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('common.save')}
        </PrimaryButton>
      </div>
    </form>
  );

  if (variant === 'page') {
    return (
      <CreatePage
        title={t('workspaces.create.title')}
        description={t('workspaces.create.description')}
        onBack={close}
      >
        <div className="flex h-full flex-col">
          <div className="flex-shrink-0 border-b border-border px-4 py-3">
            <StepIndicator labels={stepLabels} step={step} />
          </div>
          {step === 1 ? stepOneBody : stepTwoBody}
        </div>
      </CreatePage>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[520px] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex-shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{t('workspaces.create.title')}</h3>
            <button onClick={close} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3">
            <StepIndicator labels={stepLabels} step={step} />
          </div>
        </div>
        {step === 1 ? stepOneBody : stepTwoBody}
      </div>
    </div>
  );
}
