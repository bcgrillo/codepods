import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  Settings2,
  ScrollText,
  Trash2,
  Plus,
  Eye,
  Loader2,
  Globe,
  Recycle,
  SquareTerminal,
  Pencil,
  X,
  Variable,
  Check,
  GitBranch,
  Container,
  FolderGit2,
  RefreshCw,
  Copy,
  Info,
  HardDrive,
  MemoryStick,
  User,
} from 'lucide-react';
import { cx } from '../../utils/cx';
import { cn, formatBytes } from '@/lib/utils';
import {
  useUpdateAgentEnvVars,
  useRestartAgent,
  useRecreateAgent,
  useAgentContainerEnvVars,
  useExecuteAgentCommand,
  useRemoveAgent,
  useAgents,
  useAgentServices,
  useCreateAgentService,
  useRemoveAgentService,
  useUpdateAgentService,
  useAgentMcps,
  useConnectAgentMcp,
  useDisconnectAgentMcp,
  useAgentMcpTools,
  useAgentSkills,
  useConnectAgentSkill,
  useDisconnectAgentSkill,
} from '../../hooks/useAgents';
import { useAiProviders } from '../../hooks/useAiProviders';
import { useMcpServers } from '../../hooks/useMcpServers';
import { useAllSkills } from '../../hooks/useSkills';
import { useCopyAgentsMd } from '../../hooks/useWorkspaces';
import { useAgentStats } from '../../hooks/useSystem';
import { useAgentTransitionStore } from '../../store/agentTransitionStore';
import { useUiStore } from '../../store/uiStore';
import type { Agent, AgentService, AgentServiceType, DockerRunConfig, AgentMcpTools } from '@codepods/shared-types';
import { McpIcon } from '../icons/McpIcon';
import { AgentLogPanel } from './AgentLogPanel';
import { GraduationCap, FileBadge } from 'lucide-react';
import { Badge } from '../ui/badge';
import { SectionHeader } from '../ui/SectionHeader';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { SegmentedControl } from '../ui/SegmentedControl';
import { DangerConfirmField } from '../ui/DangerConfirmField';
import { FormContainer } from '../ui/FormContainer';
import { ConfirmDeleteButton } from '../ui/ConfirmDeleteButton';
import { InfoRow } from '../ui/InfoRow';
import { TemplateIcon } from '../templates/TemplateIcon';
import { inputCompactCls, secondaryBtnCls } from '../ui/styles';

interface AgentSettingsProps {
  agent: Agent;
}

interface EnvVarRow {
  key: string;
  value: string;
}

export function AgentSettings({ agent }: AgentSettingsProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = React.useState<string>('info');

  const hasSetProvider = agent.templateCommands?.some((c) => c.type === 'set_provider') ?? false;
  const hasGit =
    agent.workspaceId != null || agent.templateCommands?.some((c) => c.type === 'set_git_proxy');
  const hasMcp = agent.templateCommands?.some((c) => c.type === 'add_mcp_server');

  interface TocItem {
    id: string;
    icon: React.ReactNode;
    label: string;
    /** Destructive action (Recreate or remove) — red on hover/selected only. */
    danger?: boolean;
    /** When set, the item acts as a shortcut (e.g. opens a full-content view)
     *  instead of switching the visible section. */
    action?: () => void;
  }

  // Floating table of contents — the "Settings" title sits in the rail header.
  const tocItems: TocItem[] = [
    { id: 'info', icon: <Info className="h-4 w-4" />, label: t('agents.infoSection') },
    { id: 'service-management', icon: <Settings2 className="h-4 w-4" />, label: t('agents.serviceManagement') },
    ...(agent.dockerRunConfig
      ? [{ id: 'docker-config', icon: <Container className="h-4 w-4" />, label: t('agents.dockerConfig') }]
      : []),
    { id: 'env-vars', icon: <Variable className="h-4 w-4" />, label: t('agents.envVarsTitle') },
    ...(hasSetProvider
      ? [{ id: 'set-provider', icon: <Cpu className="h-4 w-4" />, label: t('agents.setProvider') }]
      : []),
    ...(hasGit
      ? [{ id: 'git', icon: <GitBranch className="h-4 w-4" />, label: t('agents.gitSection') }]
      : []),
    ...(hasMcp
      ? [{ id: 'mcp', icon: <McpIcon className="h-4 w-4" />, label: t('agents.mcpSection') }]
      : []),
    ...(hasMcp
      ? [{ id: 'skills', icon: <GraduationCap className="h-4 w-4" />, label: t('agents.skillsSection') }]
      : []),
    { id: 'activity-log', icon: <ScrollText className="h-4 w-4" />, label: t('agents.logs.activityTitle') },
    { id: 'container-log', icon: <SquareTerminal className="h-4 w-4" />, label: t('agents.logs.containerTitle') },
    { id: 'danger-zone', icon: <Recycle className="h-4 w-4" />, label: t('agents.dangerZone'), danger: true },
  ];

  const handleTocClick = (item: TocItem) => {
    if (item.action) {
      item.action();
      return;
    }
    setSelected(item.id);
  };

  return (
    <div className="flex h-full">
      {/* Floating table of contents — no frame, hugs the content column */}
      <div className="w-48 shrink-0 select-none py-4">
        <div className="px-3 pb-2">
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('agents.settings')}
          </p>
        </div>
        <nav className="space-y-0.5 px-2">
          {tocItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleTocClick(item)}
              className={cn(
                'nav-item',
                selected === item.id && 'nav-item-active',
                item.danger &&
                  (selected === item.id
                    ? '!bg-destructive/10 !text-destructive hover:!bg-destructive/10'
                    : 'hover:!bg-destructive/10 hover:!text-destructive'),
              )}
              aria-current={selected === item.id ? 'true' : undefined}
              title={item.label}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content — only the selected section is shown (no scrolling across sections) */}
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <FormContainer className="flex h-full flex-1 flex-col space-y-4 py-4">
          <div className={selected !== 'info' ? 'hidden' : undefined}>
            <AgentInfoSection agent={agent} />
          </div>

          <div className={selected !== 'service-management' ? 'hidden' : undefined}>
            <SettingsSection title={t('agents.serviceManagement')} icon={<Settings2 className="h-4 w-4 text-primary" />}>
              <ServiceManagementSection agent={agent} />
            </SettingsSection>
          </div>

          {agent.dockerRunConfig && (
            <div className={selected !== 'docker-config' ? 'hidden' : undefined}>
              <SettingsSection title={t('agents.dockerConfig')} icon={<Container className="h-4 w-4 text-primary" />}>
                <DockerConfigSection config={agent.dockerRunConfig} />
              </SettingsSection>
            </div>
          )}

          <div className={selected !== 'env-vars' ? 'hidden' : undefined}>
            <SettingsSection title={t('agents.envVarsTitle')} icon={<Variable className="h-4 w-4 text-primary" />}>
              <EnvVarsSection agent={agent} />
            </SettingsSection>
          </div>

          {hasSetProvider && (
            <div className={selected !== 'set-provider' ? 'hidden' : undefined}>
              <SettingsSection title={t('agents.setProvider')} icon={<Cpu className="h-4 w-4 text-primary" />}>
                <ProviderSection agent={agent} />
              </SettingsSection>
            </div>
          )}

          {hasGit && (
            <div className={selected !== 'git' ? 'hidden' : undefined}>
              <SettingsSection title={t('agents.gitSection')} icon={<GitBranch className="h-4 w-4 text-primary" />}>
                <GitSection agent={agent} />
              </SettingsSection>
            </div>
          )}

          {hasMcp && (
            <div className={selected !== 'mcp' ? 'hidden' : undefined}>
              <SettingsSection title={t('agents.mcpSection')} icon={<McpIcon className="h-4 w-4 text-primary" />}>
                <McpSection agent={agent} />
              </SettingsSection>
            </div>
          )}

          {hasMcp && (
            <div className={selected !== 'skills' ? 'hidden' : undefined}>
              <SettingsSection title={t('agents.skillsSection')} icon={<GraduationCap className="h-4 w-4 text-primary" />}>
                <SkillSection agent={agent} />
              </SettingsSection>
            </div>
          )}

          <div
            className={
              selected !== 'activity-log' && selected !== 'container-log'
                ? 'hidden'
                : 'flex min-h-0 flex-1 flex-col'
            }
          >
            <SettingsSection
              className="flex min-h-0 flex-1 flex-col"
              title={selected === 'container-log' ? t('agents.logs.containerTitle') : t('agents.logs.activityTitle')}
              icon={selected === 'container-log' ? <SquareTerminal className="h-4 w-4 text-primary" /> : <ScrollText className="h-4 w-4 text-primary" />}
            >
              <div className="min-h-0 flex-1">
                <AgentLogPanel agent={agent} kind={selected === 'container-log' ? 'container' : 'activity'} />
              </div>
            </SettingsSection>
          </div>

          <div className={selected !== 'danger-zone' ? 'hidden' : undefined}>
            <SettingsSection title={t('agents.dangerZone')} icon={<Recycle className="h-4 w-4 text-muted-foreground" />}>
              <DangerSection agent={agent} />
            </SettingsSection>
          </div>
        </FormContainer>
      </div>
    </div>
  );
}

/**
 * First settings section — agent identity + resources (dashboard-style card).
 * Shows icon, name, status, template, container ID (copyable), user ID and
 * the same per-agent resource figures the Dashboard shows.
 */
function AgentInfoSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: statsData } = useAgentStats();
  const [copied, setCopied] = React.useState<'id' | 'uid' | 'gid' | null>(null);
  const [tooltipOpen, setTooltipOpen] = React.useState(false);

  const stats = statsData?.find((s) => s.agentId === agent.id);

  const doCopy = async (text: string, which: 'id' | 'uid' | 'gid') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      // Keep the tooltip open + switch its content to "Copied!" right away.
      setTooltipOpen(true);
    } catch {
      // Clipboard unavailable (permissions / insecure context) — ignore.
    }
    setTimeout(() => setCopied(null), 1500);
  };

  const statusVariant: Record<Agent['status'], 'success' | 'secondary' | 'destructive' | 'outline'> = {
    running: 'success',
    stopped: 'secondary',
    exited: 'destructive',
    paused: 'secondary',
    unknown: 'outline',
  };

  return (
    <div className="space-y-3">
      <SectionHeader
        title={t('agents.infoSection')}
        icon={<Info className="h-4 w-4 text-primary" />}
        description={t('agents.infoDescription')}
      />

      <div className="rounded-lg border border-border bg-secondary-item/50 px-4 py-3">
        {/* Identity header */}
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background">
            <TemplateIcon
              icon={agent.templateIcon}
              iconDark={agent.templateIconDark}
              className="h-5 w-5"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
              <Badge variant={statusVariant[agent.status]}>{t(`agents.${agent.status}`)}</Badge>
            </div>
            {agent.templateName && (
              <p className="truncate text-xs text-muted-foreground">{agent.templateName}</p>
            )}
          </div>
        </div>

        {/* Identity rows */}
        <div className="space-y-1.5">
          {agent.containerId && (
            <div className="flex items-center gap-2">
              <span className="w-24 flex-shrink-0 text-xs text-muted-foreground">{t('agents.containerId')}</span>
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={agent.containerId}>
                {agent.containerId}
              </code>
              <TooltipProvider delayDuration={0} skipDelayDuration={0}>
                <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => doCopy(agent.containerId!, 'id')}
                      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft"
                    >
                      {copied === 'id' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-64 whitespace-pre-line">
                    {copied === 'id' ? (
                      t('common.copied')
                    ) : (
                      <>
                        <span className="block break-all">{stats?.containerName ?? agent.name}</span>
                        <span className="block break-all font-mono text-[10px] text-muted-foreground">{agent.containerId}</span>
                        <span className="block text-muted-foreground">{t('agents.copyContainerId')}</span>
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="flex w-24 flex-shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3 shrink-0" />
              {t('agents.userId')}
            </span>
            {agent.agentUid != null ? (
              <>
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{agent.agentUid}</code>
                <button
                  type="button"
                  onClick={() => doCopy(String(agent.agentUid!), 'uid')}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft"
                >
                  {copied === 'uid' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground/70">{t('agents.agentUidNoUser')}</span>
            )}
          </div>
          {agent.agentGid != null && agent.agentGid !== agent.agentUid && (
            <div className="flex items-center gap-2">
              <span className="w-24 flex-shrink-0 text-xs text-muted-foreground">{t('agents.groupId')}</span>
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{agent.agentGid}</code>
              <button
                type="button"
                onClick={() => doCopy(String(agent.agentGid!), 'gid')}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft"
              >
                {copied === 'gid' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>

        <div className="my-3 h-px bg-border" />

        {/* Details grid */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <InfoRow label={t('agents.image')} value={agent.image} />
          {agent.templateName && (
            <InfoRow label={t('agents.template')} value={agent.templateName} />
          )}
          <InfoRow label={t('agents.created')} value={new Date(agent.createdAt).toLocaleString()} />
          {agent.workspaceId != null && (
            <div className="flex items-center gap-2">
              <span className="w-24 flex-shrink-0 text-xs text-muted-foreground">{t('agents.workspace')}</span>
              <button
                type="button"
                onClick={() => navigate(`/workspaces/${encodeURIComponent(agent.workspaceSlug ?? '')}`)}
                className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-primary hover:text-primary-soft hover:underline"
                title={t('agents.openWorkspace')}
              >
                <FolderGit2 className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{agent.workspaceName ?? `#${agent.workspaceId}`}</span>
              </button>
            </div>
          )}
        </div>

        {/* Resources — mirrors the Dashboard figures */}
        {stats && (
          <>
            <div className="my-3 h-px bg-border" />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Cpu className="h-3.5 w-3.5 shrink-0" />
                <span className="tabular-nums text-foreground">{stats.cpuPercent != null ? `${stats.cpuPercent.toFixed(1)}%` : '—'}</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MemoryStick className="h-3.5 w-3.5 shrink-0" />
                <span className="tabular-nums text-foreground">
                  {stats.memUsed != null ? `${formatBytes(stats.memUsed)} / ${formatBytes(stats.memLimit)}` : '—'}
                </span>
              </span>
              {stats.totalSize != null && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={t('agents.totalSize')}>
                  <HardDrive className="h-3.5 w-3.5 shrink-0" />
                  <span className="tabular-nums text-foreground">{formatBytes(stats.totalSize)}</span>
                </span>
              )}
              {stats.homeSize != null && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={t('dashboard.home')}>
                  <FolderGit2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="tabular-nums text-foreground">{formatBytes(stats.homeSize)}</span>
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper — mirrors the stacked card sections used across Settings.
// ---------------------------------------------------------------------------
interface SettingsSectionProps {
  title: string;
  icon?: React.ReactNode;
  danger?: boolean;
  className?: string;
  children: React.ReactNode;
}

function SettingsSection({ title, icon, danger, className, children }: SettingsSectionProps) {
  return (
    <section className={cx('space-y-1.5', className, danger ? 'border-t border-destructive/30 pt-3' : '')}>
      <SectionHeader
        title={title}
        icon={icon}
        className={danger ? 'text-destructive' : undefined}
      />
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Environment variables section
// ---------------------------------------------------------------------------
function EnvVarsSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const updateEnvVars = useUpdateAgentEnvVars();
  const restartAgent = useRestartAgent();
  const { data: containerEnv, isLoading: containerEnvLoading } = useAgentContainerEnvVars(agent.id);

  const [rows, setRows] = React.useState<EnvVarRow[]>([]);
  const [restartAfterSave, setRestartAfterSave] = React.useState(false);
  const [savedMessage, setSavedMessage] = React.useState(false);
  const [showAllEnv, setShowAllEnv] = React.useState(false);
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    if (!initialized) {
      const initial = agent.envVars
        ? Object.entries(agent.envVars).map(([key, value]) => ({ key, value }))
        : [];
      setRows(initial.length > 0 ? initial : [{ key: '', value: '' }]);
      setInitialized(true);
    }
  }, [agent.envVars, initialized]);

  // Sync rows when agent.envVars changes externally
  React.useEffect(() => {
    if (initialized) {
      const initial = agent.envVars
        ? Object.entries(agent.envVars).map(([key, value]) => ({ key, value }))
        : [];
      setRows(initial.length > 0 ? initial : [{ key: '', value: '' }]);
    }
  }, [JSON.stringify(agent.envVars)]);

  const updateRow = (index: number, field: 'key' | 'value', val: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: val } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, { key: '', value: '' }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const buildEnvVars = (): Record<string, string> => {
    const envVars: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (key) envVars[key] = row.value;
    }
    return envVars;
  };

  const handleSave = async () => {
    const envVars = buildEnvVars();
    await updateEnvVars.mutateAsync({ id: agent.id, envVars });
    if (restartAfterSave && agent.status === 'running') {
      await restartAgent.mutateAsync(agent.id);
    }
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2000);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t('agents.envVarsDescription')}</p>

      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t('agents.envVarsKey')}
            value={row.key}
            onChange={(e) => updateRow(i, 'key', e.target.value)}
            className="flex-1 rounded bg-secondary-item border border-border px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
          />
          <span className="text-muted-foreground text-xs">=</span>
          <input
            type="text"
            placeholder={t('agents.envVarsValue')}
            value={row.value}
            onChange={(e) => updateRow(i, 'value', e.target.value)}
            className="flex-1 rounded bg-secondary-item border border-border px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
          />
          <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <button
        onClick={addRow}
        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-soft transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        {t('agents.envVarsAdd')}
      </button>

      {/* All container env vars (read-only) */}
      <div className="pt-1.5 border-t border-border/50">
        <button
          onClick={() => setShowAllEnv((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          {showAllEnv ? t('agents.envVarsHideAll') : t('agents.envVarsShowAll')}
        </button>
        {showAllEnv && (
          <div className="mt-1.5 max-h-44 overflow-auto rounded bg-background p-2 font-mono text-[11px]">
            {containerEnvLoading && <p className="text-muted-foreground py-2">{t('common.loading')}</p>}
            {!containerEnvLoading && containerEnv && Object.keys(containerEnv).length > 0 && (
              <div className="space-y-0.5">
                {Object.entries(containerEnv)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => {
                    const isSetByUs = agent.envVars && key in agent.envVars;
                    return (
                      <div key={key} className="flex gap-2">
                        <span className={cx('flex-shrink-0', isSetByUs ? 'text-primary' : 'text-muted-foreground')}>
                          {key}
                        </span>
                        <span className="text-muted-foreground">=</span>
                        <span className={cx('truncate', isSetByUs ? 'text-foreground' : 'text-muted-foreground')}>
                          {value}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
            {!containerEnvLoading && containerEnv && Object.keys(containerEnv).length === 0 && (
              <p className="text-muted-foreground py-2">{t('agents.envVarsContainerNotRunning')}</p>
            )}
          </div>
        )}
      </div>

      {savedMessage && <p className="text-xs text-emerald-400">{t('agents.envVarsSaved')}</p>}

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={restartAfterSave}
            onChange={(e) => setRestartAfterSave(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-secondary-item"
          />
          {t('agents.setProviderRestart')}
          <span className="text-amber-500/80">⚠ {t('agents.setProviderRestartWarning')}</span>
        </label>
        <button
          onClick={handleSave}
          disabled={updateEnvVars.isPending || restartAgent.isPending}
          className={cx(
            'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
          )}
        >
          {(updateEnvVars.isPending || restartAgent.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t('agents.envVarsSave')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider section
// ---------------------------------------------------------------------------
function ProviderSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const executeCommand = useExecuteAgentCommand();
  const { data: providers } = useAiProviders();

  const existing = agent.commandMeta?.set_provider ?? null;
  const hasStartAgent = agent.templateCommands?.some((c) => c.type === 'start_agent') ?? false;
  const hasStopAgent = agent.templateCommands?.some((c) => c.type === 'stop_agent') ?? false;

  const [selectedProviderSlug, setSelectedProviderSlug] = React.useState(
    existing?.providerSlug ?? 'default',
  );
  const [selectedModelName, setSelectedModelName] = React.useState(existing?.modelName ?? 'default');
  const [successMessage, setSuccessMessage] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [commandOutput, setCommandOutput] = React.useState<string | null>(null);
  const [restartAfterSet, setRestartAfterSet] = React.useState(false);

  React.useEffect(() => {
    setSelectedProviderSlug(existing?.providerSlug ?? 'default');
    setSelectedModelName(existing?.modelName ?? 'default');
  }, [existing?.providerSlug, existing?.modelName]);

  React.useEffect(() => {
    setSelectedModelName('default');
  }, [selectedProviderSlug]);

  const sortedProviders = React.useMemo(() => {
    if (!providers) return [];
    return [...providers]
      .filter((p) => p.enabled)
      .sort(
        (a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name),
      );
  }, [providers]);

  const selectedProvider = sortedProviders.find((p) => p.slug === selectedProviderSlug) ?? null;
  const selectedProviderModels = selectedProvider?.models ?? [];

  const handleExecute = async () => {
    setErrorMessage(null);
    setCommandOutput(null);
    try {
      // If restart is checked: set_provider → stop_agent → start_agent
      // If not checked: just set_provider
      const result = await executeCommand.mutateAsync({
        id: agent.id,
        dto: { type: 'set_provider', providerSlug: selectedProviderSlug, modelName: selectedModelName },
      });
      if (result.commandOutput) setCommandOutput(result.commandOutput);

      if (restartAfterSet) {
        if (hasStopAgent) {
          await executeCommand.mutateAsync({ id: agent.id, dto: { type: 'stop_agent' } });
        }
        if (hasStartAgent) {
          await executeCommand.mutateAsync({ id: agent.id, dto: { type: 'start_agent' } });
        }
      }
      setSuccessMessage(true);
      setTimeout(() => setSuccessMessage(false), 2500);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : t('agents.commandFailed'));
    }
  };

  return (
    <div className="space-y-2">
      {existing && (
        <div className="rounded border border-border bg-secondary-item/50 p-2 space-y-1">
          <p className="text-xs font-medium text-emerald-400">{t('agents.providerConfigured')}</p>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <span className="text-muted-foreground">{t('agents.providerName')}</span>
            <span className="text-foreground font-mono">{existing.providerName}</span>
            <span className="text-muted-foreground">{t('agents.providerType')}</span>
            <span className="text-foreground font-mono">{existing.providerType}</span>
            <span className="text-muted-foreground">{t('agents.modelName')}</span>
            <span className="text-foreground font-mono">{existing.modelName}</span>
            <span className="text-muted-foreground">{t('agents.configuredAt')}</span>
            <span className="text-foreground font-mono">{new Date(existing.executedAt).toLocaleString()}</span>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('agents.setProviderPrompt')}</p>

      <div className="flex items-center gap-2">
        <select
          value={selectedProviderSlug}
          onChange={(e) => setSelectedProviderSlug(e.target.value)}
          className="flex-1 rounded border border-border bg-secondary-item px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="default">{t('agents.defaultProvider')}</option>
          {sortedProviders.map((p) => (
            <option key={p.id} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={selectedModelName}
          onChange={(e) => setSelectedModelName(e.target.value)}
          className="flex-1 rounded border border-border bg-secondary-item px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="default">{t('agents.defaultModel')}</option>
          {selectedProviderModels.map((m) => (
            <option key={m.id} value={m.name}>
              {m.displayName ?? m.name}
            </option>
          ))}
        </select>
      </div>

      {successMessage && <p className="text-xs text-emerald-400">{t('agents.commandExecuted')}</p>}
      {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
      {commandOutput && (
        <div className="rounded bg-background p-2 font-mono text-[11px] text-foreground max-h-32 overflow-auto">
          {commandOutput.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={restartAfterSet}
            onChange={(e) => setRestartAfterSet(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-secondary-item"
          />
          {t('agents.setProviderRestart')}
          <span className="text-amber-500/80">⚠ {t('agents.setProviderRestartWarning')}</span>
        </label>
        <button
          onClick={handleExecute}
          disabled={executeCommand.isPending}
          className={cx(
            'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
          )}
        >
          {executeCommand.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t('agents.execute')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Git & AGENTS.md section
// ---------------------------------------------------------------------------
function GitSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const copyAgentsMd = useCopyAgentsMd();
  const executeCommand = useExecuteAgentCommand();

  const hasWorkspace = agent.workspaceId != null;
  const supportsGitProxy = agent.templateCommands?.some((c) => c.type === 'set_git_proxy') ?? false;

  const [copyNotice, setCopyNotice] = React.useState<string | null>(null);
  const [gitProxyNotice, setGitProxyNotice] = React.useState<string | null>(null);

  const handleCopy = async () => {
    setCopyNotice(null);
    if (agent.workspaceId == null) return;
    try {
      const result = await copyAgentsMd.mutateAsync({ id: agent.workspaceId });
      setCopyNotice(
        result.renamed
          ? t('agents.copyAgentsMdRenamed', { name: result.backupName })
          : t('agents.copyAgentsMdDone'),
      );
    } catch (err: unknown) {
      setCopyNotice(err instanceof Error ? err.message : t('agents.commandFailed'));
    }
  };

  const handleSetGitProxy = async () => {
    setGitProxyNotice(null);
    try {
      await executeCommand.mutateAsync({ id: agent.id, dto: { type: 'set_git_proxy' } });
      setGitProxyNotice(t('agents.setGitProxyDone'));
    } catch (err: unknown) {
      setGitProxyNotice(err instanceof Error ? err.message : t('agents.commandFailed'));
    }
  };

  return (
    <div className="space-y-3">
      {/* Copy AGENTS.md */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">{t('agents.copyAgentsMdDescription')}</p>
        {!hasWorkspace && <p className="text-xs text-amber-500/80">{t('agents.noWorkspace')}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={!hasWorkspace || copyAgentsMd.isPending}
            className={cx(
              'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {copyAgentsMd.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('agents.copyAgentsMd')}
          </button>
        </div>
        {copyNotice && <p className="text-xs text-emerald-400">{copyNotice}</p>}
      </div>

      {/* Set git proxy */}
      <div className="pt-2 border-t border-border/50 space-y-1.5">
        <p className="text-xs text-muted-foreground">{t('agents.setGitProxyDescription')}</p>
        {!supportsGitProxy && <p className="text-xs text-amber-500/80">{t('agents.gitProxyNotSupported')}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSetGitProxy}
            disabled={!supportsGitProxy || !hasWorkspace || executeCommand.isPending}
            className={cx(
              'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {executeCommand.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('agents.setGitProxy')}
          </button>
        </div>
        {gitProxyNotice && <p className="text-xs text-emerald-400">{gitProxyNotice}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MCP servers section
// ---------------------------------------------------------------------------
function McpSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const { data: assignedMcps } = useAgentMcps(agent.id);
  const { data: allMcps } = useMcpServers();
  const { data: mcpTools, isLoading: toolsLoading } = useAgentMcpTools(agent.id);
  const connectMcp = useConnectAgentMcp(agent.id);
  const disconnectMcp = useDisconnectAgentMcp(agent.id);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const assignedIds = new Set((assignedMcps ?? []).map((m) => m.id));
  const available = (allMcps ?? []).filter((m) => m.enabled && !assignedIds.has(m.id));
  const busy = connectMcp.isPending || disconnectMcp.isPending;

  const toolsBySlug = new Map<string, AgentMcpTools>();
  for (const g of mcpTools ?? []) toolsBySlug.set(g.slug, g);
  const toggle = (slug: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('agents.mcpSectionDescription')}</p>

      {/* Assigned MCP servers */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t('agents.mcpConnected')}</p>
        {(assignedMcps ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground/50">{t('agents.mcpNoneConnected')}</p>
        )}
        {(assignedMcps ?? []).map((mcp) => {
          const group = toolsBySlug.get(mcp.slug);
          const toolCount = group?.tools.length ?? 0;
          const isOpen = expanded.has(mcp.slug);
          return (
            <div key={mcp.id} className="rounded border border-border bg-secondary-item/50">
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <McpIcon className="h-3.5 w-3.5 flex-shrink-0 text-foreground" />
                  <span className="truncate text-sm text-foreground">{mcp.name}</span>
                  <code className="flex-shrink-0 text-[10px] text-muted-foreground">{mcp.slug}</code>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => toggle(mcp.slug)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary-item"
                    title={t('agents.mcpTools')}
                  >
                    {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {toolsLoading && !group ? t('agents.mcpToolsLoading') : t('agents.mcpToolsCount', { count: toolCount })}
                  </button>
                  <button
                    onClick={() => disconnectMcp.mutate(mcp.id)}
                    disabled={busy}
                    className="rounded px-2 py-0.5 text-xs text-destructive transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {t('common.remove')}
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="border-t border-border px-2.5 py-1.5">
                  {toolsLoading && !group ? (
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> {t('agents.mcpToolsLoading')}
                    </p>
                  ) : toolCount === 0 ? (
                    <p className="text-[11px] text-muted-foreground/50">{t('agents.mcpToolsNone')}</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {group!.tools.map((tool) => (
                        <li key={tool.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground" />
                          <code className="font-mono text-foreground">{tool.name}</code>
                          {tool.description && (
                            <span className="truncate text-muted-foreground/50">— {tool.description}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Available MCP servers */}
      {available.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-medium text-muted-foreground">{t('agents.mcpAvailable')}</p>
          {available.map((mcp) => (
            <div
              key={mcp.id}
              className="flex items-center justify-between rounded border border-border/50 px-2.5 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <McpIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate text-sm text-foreground">{mcp.name}</span>
                <code className="flex-shrink-0 text-[10px] text-muted-foreground/50">{mcp.slug}</code>
              </div>
              <button
                onClick={() => connectMcp.mutate(mcp.id)}
                disabled={busy}
                className="flex-shrink-0 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                {connectMcp.isPending && connectMcp.variables === mcp.id && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                {t('common.add')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills section
// ---------------------------------------------------------------------------
function SkillSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const { data: assignedSkills } = useAgentSkills(agent.id);
  const { data: allSkills } = useAllSkills();
  const connectSkill = useConnectAgentSkill(agent.id);
  const disconnectSkill = useDisconnectAgentSkill(agent.id);
  const [search, setSearch] = React.useState('');

  const assignedIds = new Set((assignedSkills ?? []).map((s) => s.id));
  const available = (allSkills ?? []).filter((s) => !assignedIds.has(s.id));
  const busy = connectSkill.isPending || disconnectSkill.isPending;

  const q = search.trim().toLowerCase();
  const matches = (s: { name: string; description?: string | null }) =>
    !q || s.name.toLowerCase().includes(q) || (s.description?.toLowerCase().includes(q) ?? false);

  const filteredAssigned = (assignedSkills ?? []).filter(matches);
  const filteredAvailable = available.filter(matches);
  // Rendering hundreds of available skills at once is unusable; only the
  // first matches are shown and the search box narrows the rest.
  const AVAILABLE_CAP = 10;
  const shownAvailable = filteredAvailable.slice(0, AVAILABLE_CAP);
  const availableTruncated = filteredAvailable.length > shownAvailable.length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('agents.skillsSectionDescription')}</p>

      {/* Assigned skills */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{t('agents.skillsConnected')}</p>
          {(assignedSkills ?? []).length > 0 && (
            <span className="rounded bg-secondary-item px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {filteredAssigned.length}/{(assignedSkills ?? []).length}
            </span>
          )}
        </div>
        {(assignedSkills ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground/50">{t('agents.skillsNoneConnected')}</p>
        )}
        {filteredAssigned.length === 0 && (assignedSkills ?? []).length > 0 && q && (
          <p className="text-xs text-muted-foreground/50">{t('common.noResults')}</p>
        )}
        {filteredAssigned.map((skill) => (
          <div
            key={skill.id}
            className="flex items-center justify-between rounded border border-border bg-secondary-item/50 px-2.5 py-1.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <FileBadge className="h-3.5 w-3.5 flex-shrink-0 text-foreground" />
              <span className="flex-shrink-0 text-sm text-foreground">{skill.name}</span>
              {skill.description && (
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/50">— {skill.description}</span>
              )}
            </div>
            <button
              onClick={() => disconnectSkill.mutate(skill.id)}
              disabled={busy}
              className="flex-shrink-0 rounded px-2 py-0.5 text-xs text-destructive transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              {t('common.remove')}
            </button>
          </div>
        ))}
      </div>

      {/* Search — between Connected and Available */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('common.search')}
        className="w-full rounded border border-border bg-secondary-item/50 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
      />

      {/* Available skills */}
      {filteredAvailable.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {t('agents.skillsAvailable')}
              {availableTruncated && ` (${t('agents.skillsShowingFirst', { count: shownAvailable.length })})`}
            </p>
            <span className="rounded bg-secondary-item px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {filteredAvailable.length}/{available.length}
            </span>
          </div>
          {shownAvailable.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center justify-between rounded border border-border/50 px-2.5 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileBadge className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="flex-shrink-0 text-sm text-foreground">{skill.name}</span>
                {skill.description && (
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/50">— {skill.description}</span>
                )}
              </div>
              <button
                onClick={() => connectSkill.mutate(skill.id)}
                disabled={busy}
                className="flex-shrink-0 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                {connectSkill.isPending && connectSkill.variables === skill.id && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                {t('common.add')}
              </button>
            </div>
          ))}
          {availableTruncated && (
            <p className="mt-1 text-[11px] text-muted-foreground/60">
              {t('agents.skillsAvailableTruncated', { shown: shownAvailable.length, total: filteredAvailable.length })}
            </p>
          )}
        </div>
      )}

      {filteredAvailable.length === 0 && available.length > 0 && q && (
        <p className="text-xs text-muted-foreground/50">{t('common.noResults')}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service management section (compact inline CRUD — like AI provider models)
// ---------------------------------------------------------------------------
function ServiceManagementSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const { data: services, isLoading } = useAgentServices(agent.id);
  const createService = useCreateAgentService(agent.id);
  const removeService = useRemoveAgentService(agent.id);
  const updateService = useUpdateAgentService(agent.id);

  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editType, setEditType] = React.useState<AgentServiceType>('web');
  const [editName, setEditName] = React.useState('');
  const [editPort, setEditPort] = React.useState('');
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<number | null>(null);

  // New service row
  const [newType, setNewType] = React.useState<AgentServiceType>('web');
  const [newName, setNewName] = React.useState('');
  const [newPort, setNewPort] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  const validate = (name: string, port: string): { name: string; port: number } | null => {
    if (!name.trim() || !port.trim()) {
      setFormError(t('agents.addService.required'));
      return null;
    }
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      setFormError(t('agents.addService.invalidPort'));
      return null;
    }
    setFormError(null);
    return { name: name.trim(), port: p };
  };

  const startEdit = (svc: AgentService) => {
    setEditingId(svc.id);
    setEditType(svc.type);
    setEditName(svc.name);
    setEditPort(String(svc.port));
    setConfirmDeleteId(null);
  };

  const saveEdit = async () => {
    if (editingId === null) return;
    const v = validate(editName, editPort);
    if (!v) return;
    try {
      await updateService.mutateAsync({ serviceId: editingId, dto: { type: editType, name: v.name, port: v.port } });
      setEditingId(null);
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : t('common.error'));
    }
  };

  const handleAdd = async () => {
    const v = validate(newName, newPort);
    if (!v) return;
    try {
      await createService.mutateAsync({ type: newType, name: v.name, port: v.port });
      setNewName('');
      setNewPort('');
      setNewType('web');
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : t('common.error'));
    }
  };

  const handleDelete = async (serviceId: number) => {
    try {
      await removeService.mutateAsync(serviceId);
      setConfirmDeleteId(null);
    } catch { /* ignore */ }
  };

  const serviceTypeLabel = (type: AgentServiceType) => (
    <>
      {type === 'terminal' ? <SquareTerminal className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
      <span className="sr-only">{t(`agents.addService.${type}`)}</span>
    </>
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Service rows */}
      {services && services.length > 0 && services.map((svc) => {
        const isEditing = editingId === svc.id;
        const isConfirming = confirmDeleteId === svc.id;
        return (
          <div
            key={svc.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-secondary-item/50 px-2.5 py-1.5"
          >
            {isEditing ? (
              <>
                <SegmentedControl
                  size="sm"
                  aria-label={t('agents.addService.type')}
                  value={editType}
                  onChange={setEditType}
                  options={[
                    { value: 'web', label: serviceTypeLabel('web') },
                    { value: 'terminal', label: serviceTypeLabel('terminal') },
                  ]}
                />
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditingId(null); }}
                  className={inputCompactCls + ' flex-1 min-w-0'}
                  autoFocus
                />
                <input
                  value={editPort}
                  onChange={(e) => setEditPort(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditingId(null); }}
                  className={inputCompactCls + ' w-16'}
                  inputMode="numeric"
                />
                <button onClick={saveEdit} disabled={updateService.isPending} title={t('common.save')}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft">
                  {updateService.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setEditingId(null)} title={t('common.cancel')}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft">
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                {svc.type === 'terminal'
                  ? <SquareTerminal className="h-4 w-4 flex-shrink-0 text-primary" />
                  : <Globe className="h-4 w-4 flex-shrink-0 text-primary" />}
                <span className="truncate text-sm font-medium text-foreground flex-1 min-w-0">{svc.name}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">:{svc.port}</span>
                <button onClick={() => startEdit(svc)} disabled={updateService.isPending} title={t('common.edit')}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary-soft">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <ConfirmDeleteButton
                  confirming={isConfirming}
                  pending={removeService.isPending}
                  onConfirmToggle={(c) => (c ? setConfirmDeleteId(svc.id) : setConfirmDeleteId(null))}
                  onDelete={() => handleDelete(svc.id)}
                  deleteTitle={t('common.delete')}
                  confirmTitle={t('common.confirm')}
                />
              </>
            )}
          </div>
        );
      })}

      {(!services || services.length === 0) && (
        <p className="text-xs text-muted-foreground/50 italic">{t('agents.noServices')}</p>
      )}

      {/* Add new service — compact single row */}
      <div className="flex items-center gap-2">
        <SegmentedControl
          size="sm"
          aria-label={t('agents.addService.type')}
          value={newType}
          onChange={setNewType}
          options={[
            { value: 'web', label: serviceTypeLabel('web') },
            { value: 'terminal', label: serviceTypeLabel('terminal') },
          ]}
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder={t('agents.addService.name')}
          className={inputCompactCls + ' flex-1 min-w-0'}
        />
        <input
          value={newPort}
          onChange={(e) => setNewPort(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder={t('agents.addService.port')}
          className={inputCompactCls + ' w-16'}
          inputMode="numeric"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || !newPort.trim() || createService.isPending}
          className={secondaryBtnCls}
        >
          {createService.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {t('common.add')}
        </button>
      </div>

      {formError && <p className="text-xs text-destructive">{formError}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Docker run config section (read-only snapshot of how the agent was started)
// ---------------------------------------------------------------------------
function DockerConfigSection({ config }: { config: DockerRunConfig }) {
  const { t } = useTranslation();

  const rows: Array<{ label: string; flag: string; value: string | null; enabled: boolean }> = [
    { label: t('settings.dockerAutoRemove'), flag: '--rm', value: null, enabled: config.autoRemove },
    { label: t('settings.dockerReadOnly'), flag: '--read-only', value: null, enabled: config.readOnly },
    { label: t('settings.dockerTmpfsSize'), flag: '--tmpfs /tmp', value: config.tmpfsSize || null, enabled: !!config.tmpfsSize },
    { label: t('settings.dockerCapDropAll'), flag: '--cap-drop=ALL', value: null, enabled: config.capDropAll },
    { label: t('settings.dockerDropNetRaw'), flag: '--cap-drop=NET_RAW', value: null, enabled: config.capDropAll ? false : config.dropNetRaw },
    { label: t('settings.dockerNoNewPrivileges'), flag: '--security-opt', value: null, enabled: config.noNewPrivileges },
    { label: t('settings.dockerPidsLimit'), flag: '--pids-limit', value: config.pidsLimit !== null ? String(config.pidsLimit) : null, enabled: config.pidsLimit !== null },
    { label: t('settings.dockerMemoryLimit'), flag: '--memory', value: config.memoryLimit || null, enabled: !!config.memoryLimit },
    { label: t('settings.dockerCpuLimit'), flag: '--cpus', value: config.cpuLimit > 0 ? String(config.cpuLimit) : null, enabled: config.cpuLimit > 0 },
    { label: t('settings.dockerRuntimeRunsc'), flag: '--runtime', value: config.runtime || null, enabled: !!config.runtime },
    { label: t('settings.dockerUser'), flag: '--user <uid>:<gid>', value: null, enabled: config.forceNonRootUser },
    { label: t('settings.dockerCustomArgsLabel'), flag: 'custom', value: config.customArgs || null, enabled: !!config.customArgs },
  ];

  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground mb-1.5">{t('agents.dockerConfigHint')}</p>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-2 text-sm py-0.5">
          <span className="text-muted-foreground">{row.label}</span>
          <div className="flex items-center gap-1.5">
            {row.enabled && (
              <code className="rounded bg-secondary-item px-1.5 py-0.5 text-[10px] font-mono text-primary/80">{row.flag}</code>
            )}
            <span className={cx('font-mono text-xs', row.enabled ? 'text-foreground' : 'text-muted-foreground/50')}>
              {row.enabled ? (row.value ?? '✓') : '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger zone section
// ---------------------------------------------------------------------------
function DangerSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const removeAgent = useRemoveAgent();
  const recreateAgent = useRecreateAgent();
  const { setSelectedAgent } = useUiStore();
  const setTransition = useAgentTransitionStore((s) => s.setTransition);
  const { data: allAgents } = useAgents();
  const [confirmName, setConfirmName] = React.useState('');
  const [deleteWorkspace, setDeleteWorkspace] = React.useState(false);
  const [confirmRecreate, setConfirmRecreate] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const hasWorkspace = agent.workspaceId != null;
  // Workspace can be safely deleted if no other agent references it.
  const otherAgentsUsingWs = allAgents?.filter(
    (a) => a.id !== agent.id && a.workspaceId === agent.workspaceId,
  ).length ?? 0;
  const canDeleteWorkspace = hasWorkspace && otherAgentsUsingWs === 0;

  const canDelete = confirmName === agent.name;

  const handleDelete = async () => {
    if (!canDelete) return;
    // Mark the agent as "deleting" so the sidebar action buttons + card follow
    // suit immediately (amber) and don't re-enable while the DELETE is in flight.
    setDeleting(true);
    setTransition(agent.id, 'deleting');
    try {
      await removeAgent.mutateAsync({ id: agent.id, deleteWorkspace: deleteWorkspace && canDeleteWorkspace });
      // Navigate first so the URL→store sync doesn't re-select the deleted
      // agent from stale params, then clear the selection.
      navigate('/agents', { replace: true });
      setSelectedAgent(null);
    } finally {
      // Clear the transition once the UI has fully detached (or on failure the
      // optimistic rollback restored the card — unstick the delete state).
      setDeleting(false);
      setTransition(agent.id, null);
    }
  };

  const handleRecreate = async () => {
    setConfirmRecreate(false);
    setTransition(agent.id, 'recreating');
    await recreateAgent.mutateAsync(agent.id, {
      onSettled: () => setTransition(agent.id, null),
    });
  };

  return (
    <div className="space-y-6">
      {/* Recreate subsection */}
      <div className="space-y-3">
        <SectionHeader title={t('agents.recreateSection')} size="sm" />
        <p className="text-xs text-muted-foreground">{t('agents.dangerRecreateDescription')}</p>
        {confirmRecreate ? (
          <div className="space-y-2">
            <p className="text-xs text-amber-500">{t('agents.dangerRecreateConfirm')}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRecreate(false)}
                className="rounded px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleRecreate}
                disabled={recreateAgent.isPending}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                  'bg-amber-600 text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                {recreateAgent.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {t('agents.recreate')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              onClick={() => setConfirmRecreate(true)}
              disabled={recreateAgent.isPending}
              className={cx(
                'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                'border border-amber-600/50 text-amber-600 hover:bg-amber-600/10 disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              {recreateAgent.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {t('agents.recreate')}
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Remove subsection */}
      <div className="space-y-3">
        <SectionHeader title={t('agents.removeSection')} size="sm" />
        <p className="text-xs text-muted-foreground">{t('agents.dangerDeleteDescription')}</p>
        <DangerConfirmField
          label={
            <>
              {t('agents.dangerTypeConfirm')} <span className="font-mono text-destructive">{agent.name}</span>
            </>
          }
          value={confirmName}
          onChange={setConfirmName}
          placeholder={agent.name}
        />
        {canDeleteWorkspace && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={deleteWorkspace}
              onChange={(e) => setDeleteWorkspace(e.target.checked)}
              className="rounded border-border bg-secondary-item"
            />
            {t('agents.dangerDeleteWorkspace', { name: agent.workspaceName })}
          </label>
        )}
        <div className="flex justify-end">
          <button
            onClick={handleDelete}
            disabled={!canDelete || removeAgent.isPending || deleting}
            className={cx(
              'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
              'bg-red-600 text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {removeAgent.isPending || deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {t(removeAgent.isPending || deleting ? 'agents.deleting' : 'agents.remove')}
          </button>
        </div>
      </div>
    </div>
  );
}