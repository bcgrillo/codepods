import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Loader2, Pencil, RefreshCw, Trash2, X, SwatchBook } from 'lucide-react';
import { ContentShell } from '../ContentShell';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { SectionHeader } from '../ui/SectionHeader';
import { InfoRow } from '../ui/InfoRow';
import {
  useImageTemplate,
  useRemoveImageTemplate,
  useUpdateImageTemplate,
} from '../../hooks/useAgents';
import { useUiStore } from '../../store/uiStore';
import { useBuildStore } from '../../store/buildStore';

interface TemplateDetailViewProps {
  templateId: number | null;
}

export function TemplateDetailView({ templateId }: TemplateDetailViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: template, isLoading } = useImageTemplate(templateId);
  const removeTemplate = useRemoveImageTemplate();
  const updateTemplate = useUpdateImageTemplate();
  const { setSelectedImageTemplate } = useUiStore();
  const buildState = useBuildStore((s) => (templateId ? s.builds[templateId] : undefined));
  const startBuild = useBuildStore((s) => s.startBuild);

  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const buildOutputRef = React.useRef<HTMLDivElement>(null);

  const isBuilding = buildState?.isBuilding ?? false;
  const buildOutput = buildState?.output ?? template?.lastBuildOutput ?? [];
  const buildError = buildState?.error ?? null;
  const buildInfo = buildState?.action === 'existing' ? t('images.ensure.upToDate') : null;

  React.useEffect(() => {
    setNameDraft(template?.name ?? '');
    setIsEditing(false);
    setNameError(null);
  }, [template?.id, template?.name]);

  React.useEffect(() => {
    const el = buildOutputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [buildOutput]);

  const handleBack = () => {
    setSelectedImageTemplate(null);
    navigate('/agents/templates');
  };

  if (!templateId) {
    return (
      <div className="flex h-full select-none items-center justify-center text-sm text-muted-foreground">
        {t('images.selectTemplate')}
      </div>
    );
  }

  if (isLoading || !template) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  const handleEnsure = () => startBuild(template.id, true);

  const handleRemove = async () => {
    if (!window.confirm(t('images.removeConfirm'))) return;
    await removeTemplate.mutateAsync(template.id);
    handleBack();
  };

  const handleRename = async () => {
    const nextName = nameDraft.trim();
    if (!nextName) {
      setNameError(t('images.rename.validationRequired'));
      return;
    }
    try {
      await updateTemplate.mutateAsync({ id: template.id, dto: { name: nextName } });
      setIsEditing(false);
      setNameError(null);
      navigate(`/agents/templates/${encodeURIComponent(nextName)}`, { replace: true });
    } catch (error: unknown) {
      setNameError(error instanceof Error ? error.message : t('common.error'));
    }
  };

  const handleToggleEnabled = () =>
    updateTemplate.mutate({ id: template.id, dto: { enabled: !template.enabled } });

  const headerActions: React.ReactNode[] = [
    <ToggleSwitch
      key="toggle"
      checked={template.enabled}
      onChange={handleToggleEnabled}
      disabled={updateTemplate.isPending}
      labelOn={t('images.enabled')}
      labelOff={t('images.disabled')}
    />,
    <button
      key="edit"
      type="button"
      onClick={() => setIsEditing((v) => !v)}
      className="btn-icon"
      title={t('images.detail.edit', { defaultValue: 'Edit' })}
    >
      <Pencil className="h-4 w-4" />
    </button>,
    <button
      key="ensure"
      type="button"
      onClick={handleEnsure}
      disabled={isBuilding}
      className="btn-icon"
      title={t('images.ensure.cta')}
    >
      {isBuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
    </button>,
    <button
      key="remove"
      type="button"
      onClick={handleRemove}
      disabled={removeTemplate.isPending}
      className="btn-icon hover:bg-destructive/10 hover:text-red-500"
      title={t('agents.remove')}
    >
      <Trash2 className="h-4 w-4" />
    </button>,
  ];

  return (
    <ContentShell
      title={isEditing ? nameDraft || template.name : template.name}
      icon={SwatchBook}
      subtitle={template.repoUrl}
      badges={[
        template.enabled
          ? { label: t('images.enabled'), variant: 'secondary' }
          : { label: t('images.disabled'), variant: 'outline' },
        template.lastBuiltImageRef
          ? { label: t('images.built'), variant: 'default' }
          : { label: t('images.notBuilt'), variant: 'outline' },
      ]}
      showBack
      onBack={handleBack}
      actions={headerActions}
    >
      <div className="flex h-full flex-col">
        {isEditing && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="w-[320px] max-w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={handleRename}
              title={t('images.rename.save')}
              className="btn-icon"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setIsEditing(false); setNameDraft(template.name); setNameError(null); }}
              title={t('images.rename.cancel')}
              className="btn-icon"
            >
              <X className="h-4 w-4" />
            </button>
            {nameError && <p className="text-xs text-red-500">{nameError}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-b border-border px-4 py-3">
          <div className="space-y-3">
            <InfoRow label={t('images.repoUrl')} value={
              <span className="flex items-center gap-1">
                <span className="truncate">{template.repoUrl}</span>
                <a
                  href={template.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={t('images.openRepo')}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </span>
            } />
            <InfoRow label={t('images.repoPath')} value={template.repoPath} />
            <InfoRow label={t('images.branch')} value={template.branch} />
            <InfoRow
              label={template.lastBuiltTag ? t('images.tag') : t('images.commit')}
              value={template.lastBuiltTag ?? template.lastBuiltCommit ?? '-'}
            />
          </div>
          <div className="space-y-3">
            <InfoRow label={t('images.imageRef')} value={template.lastBuiltImageRef ?? t('images.notBuilt')} />
            <InfoRow
              label={t('images.lastBuiltAt')}
              value={template.lastBuiltAt ? new Date(template.lastBuiltAt).toLocaleString() : '-'}
            />
            <InfoRow
              label={t('images.commands')}
              value={<CommandList commands={template.manifest?.commands ?? []} />}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
          <SectionHeader size="sm" title={t('images.buildOutput')} className="mb-2 shrink-0" />
          {isBuilding && (
            <p className="mb-2 flex shrink-0 items-center gap-1.5 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('images.ensure.building')}
            </p>
          )}
          {buildInfo && !isBuilding && <p className="mb-2 shrink-0 text-xs text-emerald-500">{buildInfo}</p>}
          {buildError && <p className="mb-2 shrink-0 text-xs text-red-500">{buildError}</p>}
          <div
            ref={buildOutputRef}
            className="min-h-0 flex-1 overflow-auto rounded bg-background p-3 font-mono text-[11px] text-foreground"
          >
            {buildOutput.length > 0
              ? buildOutput.map((line, i) => <p key={`${i}-${line}`}>{line}</p>)
              : <p className="text-muted-foreground">{t('images.buildOutputEmpty')}</p>}
          </div>
        </div>
      </div>
    </ContentShell>
  );
}

const COMMAND_LABELS: Record<string, string> = {
  set_provider: 'images.commandSetProvider',
  set_git_proxy: 'images.commandSetGitProxy',
  add_mcp_server: 'images.commandAddMcpServer',
  start_agent: 'images.commandStartAgent',
  stop_agent: 'images.commandStopAgent',
};

function CommandList({ commands }: { commands: { type: string; command: string }[] }) {
  const { t } = useTranslation();
  if (commands.length === 0) return <span className="text-muted-foreground">{t('images.noCommands')}</span>;
  const labels = commands.map((cmd) => {
    const key = COMMAND_LABELS[cmd.type];
    return key ? t(key) : cmd.type;
  });
  return <span>{labels.join(', ')}</span>;
}