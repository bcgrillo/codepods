import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Cpu, MemoryStick, HardDrive, Trash2, ArrowDown, Search, BrushCleaning, Info, Loader2, Gauge, Check } from 'lucide-react';
import { useSystemStats, useAgentStats, useNonCodepodsContainers } from '../../hooks/useSystem';
import { useCleanupCheck } from '../../hooks/useSystem';
import { CleanupView } from './CleanupView';
import { ContentShell } from '../ContentShell';
import { Switch } from '../ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatBytes, formatPercent } from '@/lib/utils';
import type { AgentStats, AgentStatsSortBy } from '@codepods/shared-types';

function ResourceBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = clamped > 85 ? 'bg-destructive' : clamped > 60 ? 'bg-warning' : 'bg-primary';
  return (
    <div className="h-2 w-full rounded-full bg-border overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function CompactMetricCard({
  icon: Icon,
  label,
  percent,
  used,
  total,
  active,
  onAction,
  actionIcon: ActionIcon = Search,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  percent: number;
  used: number;
  total: number;
  active?: boolean;
  onAction?: () => void;
  actionIcon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-panel-background p-3 shadow-sm flex flex-col gap-2 transition-all',
        active ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/40',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-4 w-4 text-primary-soft" />
          <h3 className="text-xs font-semibold">{label}</h3>
        </div>
        <span className="text-base font-bold">{formatPercent(percent)}</span>
      </div>
      <ResourceBar percent={percent} />
      <div className="flex items-end justify-between mt-auto">
        <div className="text-xs text-muted-foreground">
          {formatBytes(used)} / {formatBytes(total)}
        </div>
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <ActionIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function CleanupCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: cleanup } = useCleanupCheck();

  const orphanedCount = cleanup?.orphanedWorkspaces.length ?? 0;
  const orphanedHomesCount = cleanup?.orphanedHomes.length ?? 0;
  const unusedCount = cleanup?.unusedDockerImages.length ?? 0;
  const totalCleanable = orphanedCount + orphanedHomesCount + unusedCount;

  return (
    <div className="rounded-xl border border-border bg-panel-background p-3 shadow-sm flex flex-col gap-2 transition-all hover:border-primary/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Trash2 className="h-4 w-4 text-primary-soft" />
          <h3 className="text-xs font-semibold">{t('dashboard.cleanup')}</h3>
        </div>
        {totalCleanable > 0 && (
          <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
            {totalCleanable}
          </span>
        )}
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('dashboard.orphanedWorkspaces')}</span>
          <span className={cn('font-medium', orphanedCount > 0 && 'text-warning')}>{orphanedCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('dashboard.orphanedHomes')}</span>
          <span className={cn('font-medium', orphanedHomesCount > 0 && 'text-warning')}>{orphanedHomesCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('dashboard.unusedImages')}</span>
          <span className={cn('font-medium', unusedCount > 0 && 'text-warning')}>{unusedCount}</span>
        </div>
      </div>
      <div className="flex justify-end mt-auto">
        <button
          type="button"
          onClick={() => navigate('/agents/dashboard/cleanup')}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <BrushCleaning className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Format disk as "writable / virtual" — compact form for table cells. */
function formatDisk(used: number | undefined, total: number | undefined): string {
  if (used == null && total == null) return '—';
  return `${formatBytes(used ?? 0)} / ${formatBytes(total ?? 0)}`;
}

const sortMetrics: { key: AgentStatsSortBy; labelKey: string }[] = [
  { key: 'cpu', labelKey: 'dashboard.cpu' },
  { key: 'mem', labelKey: 'dashboard.memory' },
  { key: 'disk', labelKey: 'dashboard.disk' },
  { key: 'processes', labelKey: 'dashboard.processes' },
  { key: 'total', labelKey: 'dashboard.total' },
];

function DashboardHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showNonCodepods, setShowNonCodepods] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tooltipAgentId, setTooltipAgentId] = useState<string | null>(null);
  const sortBy = (searchParams.get('sort') as AgentStatsSortBy) ?? 'cpu';
  const { data: stats } = useSystemStats();
  const { data: agentStats, isLoading } = useAgentStats();
  const { data: nonCodepods } = useNonCodepodsContainers();

  const memPercent = stats && stats.memTotal > 0 ? (stats.memUsed / stats.memTotal) * 100 : 0;
  const diskPercent = stats && stats.diskTotal > 0 ? (stats.diskUsed / stats.diskTotal) * 100 : 0;

  // Merge non-codepods containers into the table as pseudo-AgentStats rows
  const merged: AgentStats[] = useMemo(() => {
    const base = agentStats ?? [];
    if (!showNonCodepods) return base;
    const external: AgentStats[] = (nonCodepods ?? []).map((c) => ({
      agentId: c.id,
      agentName: c.name,
      status: c.status,
      cpuPercent: c.cpuPercent,
      memUsed: c.memUsed,
      memLimit: c.memLimit,
      diskUsed: c.diskUsed || undefined,
      diskTotal: c.diskTotal || undefined,
      processCount: c.processCount,
      image: c.image,
      isExternal: true,
    }));
    return [...base, ...external];
  }, [agentStats, nonCodepods, showNonCodepods]);

  const sorted = useMemo(() => {
    return [...merged].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'cpu') cmp = b.cpuPercent - a.cpuPercent;
      else if (sortBy === 'mem') cmp = b.memUsed - a.memUsed;
      else if (sortBy === 'disk') cmp = (b.diskTotal ?? 0) - (a.diskTotal ?? 0);
      else if (sortBy === 'total') cmp = (b.totalSize ?? 0) - (a.totalSize ?? 0);
      else cmp = b.processCount - a.processCount;
      if (cmp !== 0) return cmp;
      // Ties: running first, then stopped, then alphabetical by name
      const statusRank = (s: string) => (s === 'running' ? 0 : s === 'unknown' ? 2 : 1);
      cmp = statusRank(a.status) - statusRank(b.status);
      if (cmp !== 0) return cmp;
      return a.agentName.localeCompare(b.agentName);
    });
  }, [merged, sortBy]);

  const setSort = (metric: AgentStatsSortBy) => {
    setSearchParams({ sort: metric });
  };

  const hasSharedWs = sorted.some((a) => a.workspaceShared === true);

  return (
    <ContentShell title={t('dashboard.title')} icon={Gauge} noScroll>
      {/* Compact cards row */}
      <div className="shrink-0 p-4 pb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <span>{t('dashboard.agentCount')}: <strong className="text-foreground">{stats?.agentCount ?? '—'}</strong></span>
          <span className="text-border">·</span>
          <span>{t('dashboard.containerCount')}: <strong className="text-foreground">{stats?.containerCount ?? '—'}</strong></span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CompactMetricCard
            icon={Cpu}
            label={t('dashboard.cpuUsage')}
            percent={stats?.cpuPercent ?? 0}
            used={0}
            total={100}
            active={sortBy === 'cpu'}
            onAction={() => setSort('cpu')}
          />
          <CompactMetricCard
            icon={MemoryStick}
            label={t('dashboard.memUsage')}
            percent={memPercent}
            used={stats?.memUsed ?? 0}
            total={stats?.memTotal ?? 0}
            active={sortBy === 'mem'}
            onAction={() => setSort('mem')}
          />
          <CompactMetricCard
            icon={HardDrive}
            label={t('dashboard.diskUsage')}
            percent={diskPercent}
            used={stats?.diskUsed ?? 0}
            total={stats?.diskTotal ?? 0}
            active={sortBy === 'disk' || sortBy === 'total'}
            onAction={() => setSort('total')}
          />
          <CleanupCard />
        </div>
      </div>

      {/* Agent stats table — scrollable */}
      <div className="flex-1 overflow-auto">
        {/* Non-codepods toggle */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <Switch checked={showNonCodepods} onCheckedChange={setShowNonCodepods} id="show-non-codepods" />
          <label htmlFor="show-non-codepods" className="text-xs text-muted-foreground cursor-pointer select-none">
            {t('dashboard.showNonCodepods')}
          </label>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        )}
        {!isLoading && sorted.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">No agents found.</div>
        )}
        {sorted.length > 0 && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel-background border-b border-border z-10">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">{t('dashboard.agentName')}</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">{t('dashboard.status')}</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">{t('dashboard.image')}</th>
                {sortMetrics.map((m) => (
                  <th
                    key={m.key}
                    className={cn(
                      'px-4 py-2 text-right font-medium cursor-pointer hover:text-foreground select-none transition-colors whitespace-nowrap',
                      sortBy === m.key
                        ? 'text-primary bg-primary/5'
                        : 'text-muted-foreground',
                    )}
                    onClick={() => setSort(m.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {t(m.labelKey)}
                      {sortBy === m.key && <ArrowDown className="h-3 w-3" />}
                    </span>
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t('dashboard.ws')}</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{t('dashboard.home')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.agentId} className={cn('border-b border-border/50 hover:bg-muted/30', a.isExternal && 'opacity-75')}>
                  <td className="px-4 py-2 truncate max-w-48">
                    <span className="inline-flex items-center gap-1.5">
                      {a.isExternal ? (
                        <span className="truncate">N/A</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate(`/agents/${encodeURIComponent(a.agentName)}`)}
                          className="truncate font-medium text-foreground hover:text-primary-soft hover:underline transition-colors"
                          title={a.agentName}
                        >
                          {a.agentName}
                        </button>
                      )}
                      {!a.isExternal && (a.containerName || a.containerFullId) && (
                        <TooltipProvider delayDuration={0} skipDelayDuration={0}>
                          <Tooltip
                            open={tooltipAgentId === a.agentId}
                            onOpenChange={(open) => setTooltipAgentId(open ? a.agentId : null)}
                          >
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard?.writeText(a.containerFullId ?? a.agentId);
                                  setCopiedId(a.agentId);
                                  setTooltipAgentId(a.agentId);
                                  setTimeout(() => setCopiedId((c) => (c === a.agentId ? null : c)), 1500);
                                }}
                              >
                                {copiedId === a.agentId ? <Check className="h-3 w-3 text-emerald-500" /> : <Info className="h-3 w-3" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-64 whitespace-pre-line">
                              {copiedId === a.agentId ? (
                                t('common.copied')
                              ) : (
                                <>
                                  <span className="block break-all">{a.containerName}</span>
                                  <span className="block break-all font-mono text-[10px] text-muted-foreground">{a.containerFullId ?? a.agentId}</span>
                                  <span className="block text-muted-foreground">{t('dashboard.copyContainerId')}</span>
                                </>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {a.isExternal && (
                        <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">{t('dashboard.external')}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-medium',
                        a.status === 'running'
                          ? 'text-success'
                          : a.status === 'unknown'
                            ? 'text-muted-foreground'
                            : 'text-destructive',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          a.status === 'running'
                            ? 'bg-success'
                            : a.status === 'unknown'
                              ? 'bg-muted-foreground'
                              : 'bg-destructive',
                        )}
                      />
                      {a.status === 'running'
                        ? t('dashboard.running')
                        : a.status === 'unknown'
                          ? t('dashboard.unknown')
                          : t('dashboard.stopped')}
                    </span>
                  </td>
                  <td className="px-4 py-2 truncate max-w-32 text-muted-foreground">{a.image}</td>
                  <td className={cn('px-4 py-2 text-right whitespace-nowrap', sortBy === 'cpu' && 'bg-primary/5 font-medium')}>{formatPercent(a.cpuPercent)}</td>
                  <td className={cn('px-4 py-2 text-right whitespace-nowrap', sortBy === 'mem' && 'bg-primary/5 font-medium')}>{formatBytes(a.memUsed)}</td>
                  <td className={cn('px-4 py-2 text-right whitespace-nowrap', (sortBy === 'disk' || sortBy === 'total') && 'bg-primary/5 font-medium')}>
                    <span title={`${t('dashboard.disk')}: ${formatBytes(a.diskUsed ?? 0)} · ${t('dashboard.virtual')}: ${formatBytes(a.diskTotal ?? 0)}`}>
                      {formatDisk(a.diskUsed, a.diskTotal)}
                    </span>
                  </td>
                  <td className={cn('px-4 py-2 text-right whitespace-nowrap', sortBy === 'processes' && 'bg-primary/5 font-medium')}>{a.processCount}</td>
                  <td className={cn('px-4 py-2 text-right whitespace-nowrap font-semibold', sortBy === 'total' && 'bg-primary/5')}>
                    {a.isExternal ? 'N/A' : formatBytes(a.totalSize ?? 0)}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground whitespace-nowrap">
                    {a.isExternal ? 'N/A' : a.workspaceSize != null ? (
                      <span>
                        {formatBytes(a.workspaceSize)}
                        {a.workspaceShared === true && <span className="text-warning ml-0.5">*</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground whitespace-nowrap">
                    {a.isExternal ? 'N/A' : a.homeSize != null ? formatBytes(a.homeSize) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Shared workspace note */}
        {hasSharedWs && (
          <div className="px-4 py-1.5 text-xs text-muted-foreground">
            <span className="text-warning">*</span> {t('dashboard.sharedWorkspaceNote')}
          </div>
        )}
      </div>
    </ContentShell>
  );
}

export function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const isCleanup = location.pathname === '/agents/dashboard/cleanup';

  if (isCleanup) {
    return <CleanupView onBack={() => navigate('/agents/dashboard')} />;
  }

  return <DashboardHome />;
}