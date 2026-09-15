import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FolderGit2, Home, SwatchBook, Trash2, Loader2 } from 'lucide-react';
import { ContentShell } from '../ContentShell';
import { useCleanupCheck, useRemoveDockerImage, useRemoveOrphanedHome } from '../../hooks/useSystem';
import { useRemoveWorkspace } from '../../hooks/useWorkspaces';
import { cn, formatBytes } from '@/lib/utils';
import { Checkbox } from '../ui/Checkbox';

export function CleanupView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { data: cleanup, isLoading, refetch } = useCleanupCheck();
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<Set<number>>(new Set());
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [selectedHomes, setSelectedHomes] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const removeDockerImage = useRemoveDockerImage();
  const removeWorkspace = useRemoveWorkspace();
  const removeOrphanedHome = useRemoveOrphanedHome();

  const toggleWorkspace = (id: number) => {
    setSelectedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleImage = (ref: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  };

  const toggleHome = (agentId: string) => {
    setSelectedHomes((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };

  // Select-all helpers
  const allWorkspaceIds = (cleanup?.orphanedWorkspaces ?? []).map((w) => w.workspaceId);
  const allHomeIds = (cleanup?.orphanedHomes ?? []).map((h) => h.agentId);
  const allImageRefs = (cleanup?.unusedDockerImages ?? []).map((i) => i.imageRef);

  const toggleAllWorkspaces = () => {
    setSelectedWorkspaces((prev) =>
      prev.size === allWorkspaceIds.length ? new Set() : new Set(allWorkspaceIds),
    );
  };
  const toggleAllHomes = () => {
    setSelectedHomes((prev) =>
      prev.size === allHomeIds.length ? new Set() : new Set(allHomeIds),
    );
  };
  const toggleAllImages = () => {
    setSelectedImages((prev) =>
      prev.size === allImageRefs.length ? new Set() : new Set(allImageRefs),
    );
  };

  const workspaceCheckState =
    selectedWorkspaces.size === 0
      ? false
      : selectedWorkspaces.size === allWorkspaceIds.length
        ? true
        : 'indeterminate';
  const homeCheckState =
    selectedHomes.size === 0
      ? false
      : selectedHomes.size === allHomeIds.length
        ? true
        : 'indeterminate';
  const imageCheckState =
    selectedImages.size === 0
      ? false
      : selectedImages.size === allImageRefs.length
        ? true
        : 'indeterminate';

  const totalSelected = selectedWorkspaces.size + selectedImages.size + selectedHomes.size;

  // Space calculations
  const totalCleanableSpace =
    (cleanup?.orphanedWorkspaces.reduce((sum, w) => sum + (w.size ?? 0), 0) ?? 0) +
    (cleanup?.orphanedHomes.reduce((sum, h) => sum + (h.size ?? 0), 0) ?? 0) +
    (cleanup?.unusedDockerImages.reduce((sum, i) => sum + i.size, 0) ?? 0);

  const selectedSpace =
    (cleanup?.orphanedWorkspaces
      .filter((w) => selectedWorkspaces.has(w.workspaceId))
      .reduce((sum, w) => sum + (w.size ?? 0), 0) ?? 0) +
    (cleanup?.orphanedHomes
      .filter((h) => selectedHomes.has(h.agentId))
      .reduce((sum, h) => sum + (h.size ?? 0), 0) ?? 0) +
    (cleanup?.unusedDockerImages
      .filter((i) => selectedImages.has(i.imageRef))
      .reduce((sum, i) => sum + i.size, 0) ?? 0);

  const handleDelete = async () => {
    setBusy(true);
    try {
      // Delete orphaned workspaces
      for (const id of selectedWorkspaces) {
        await removeWorkspace.mutateAsync(id);
      }
      // Delete orphaned homes
      for (const agentId of selectedHomes) {
        await removeOrphanedHome.mutateAsync(agentId);
      }
      // Delete unused Docker images via docker rmi
      for (const ref of selectedImages) {
        await removeDockerImage.mutateAsync(ref);
      }
      // Note: workspace deletion requires the workspaces API delete endpoint
      // For now we only delete Docker images — workspaces and orphaned homes
      // would need their own delete endpoints/mutations.
      setSelectedWorkspaces(new Set());
      setSelectedHomes(new Set());
      setSelectedImages(new Set());
      setConfirmOpen(false);
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const thClass =
    'text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1.5';
  const tdClass = 'px-2 py-1.5 text-xs align-middle';
  const checkTdClass = 'px-2 py-1.5 text-xs align-middle leading-none';

  return (
    <ContentShell
      title={t('dashboard.cleanupCenter')}
      showBack
      onBack={onBack}
      noScroll
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              {t('dashboard.totalCleanable')}: <strong className="text-foreground tabular-nums">{formatBytes(totalCleanableSpace)}</strong>
            </span>
            {totalSelected > 0 && (
              <span>
                {t('dashboard.selectedForCleanup')}: <strong className="text-warning tabular-nums">{formatBytes(selectedSpace)}</strong>
              </span>
            )}
          </div>
          {confirmOpen ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-warning flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                {t('dashboard.confirmDelete')}
              </span>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                disabled={busy}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                disabled={busy}
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                {busy ? t('common.deleting') : t('dashboard.deleteSelected')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              disabled={totalSelected === 0}
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              {t('dashboard.deleteSelected')}
            </button>
          )}
        </div>
      }
    >
      <div className="overflow-auto h-full p-4 space-y-6">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        )}

        {cleanup && (
        <>
        {/* Orphaned Workspaces */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FolderGit2 className="h-5 w-5 text-primary-soft" />
            <h3 className="text-sm font-semibold">{t('dashboard.orphanedWorkspaces')}</h3>
            {cleanup && cleanup.orphanedWorkspaces.length > 0 && (
              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
                {cleanup.orphanedWorkspaces.length}
              </span>
            )}
          </div>
          {cleanup && cleanup.orphanedWorkspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('dashboard.noOrphanedWorkspaces')}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse">
                <thead className="bg-muted/30">
                  <tr>
                    <th scope="col" className={cn(thClass, 'w-10 leading-none')}>
                      <Checkbox
                        checked={workspaceCheckState}
                        onCheckedChange={toggleAllWorkspaces}
                      />
                    </th>
                    <th scope="col" className={thClass}>Name</th>
                    <th scope="col" className={thClass}>Type</th>
                    <th scope="col" className={thClass}>Git</th>
                    <th scope="col" className={cn(thClass, 'text-right')}>{t('dashboard.size')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cleanup?.orphanedWorkspaces.map((ws, idx) => {
                    const hasWarnings = ws.gitDirty || ws.gitAhead;
                    return (
                      <tr
                        key={ws.workspaceId}
                        onClick={() => toggleWorkspace(ws.workspaceId)}
                        className={cn(
                          'cursor-pointer border-t border-border transition-colors',
                          selectedWorkspaces.has(ws.workspaceId)
                            ? 'bg-primary/5'
                            : 'hover:bg-muted/30',
                          idx === 0 && 'border-t-0',
                        )}
                      >
                        <td className={checkTdClass} onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedWorkspaces.has(ws.workspaceId)}
                            onCheckedChange={() => toggleWorkspace(ws.workspaceId)}
                          />
                        </td>
                        <td className={cn(tdClass, 'font-medium truncate max-w-0')}>
                          <span className="flex items-center gap-2">
                            <span className="truncate">{ws.name}</span>
                            {ws.stoppedAgentCount > 0 && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {ws.stoppedAgentCount} {t('dashboard.stoppedAgents')}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className={cn(tdClass, 'text-muted-foreground whitespace-nowrap')}>
                          {ws.type}
                        </td>
                        <td className={tdClass}>
                          {hasWarnings ? (
                            <span className="flex items-center gap-1 text-xs text-warning">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {ws.gitDirty && <span>{t('dashboard.gitDirty')}</span>}
                              {ws.gitDirty && ws.gitAhead && <span>·</span>}
                              {ws.gitAhead && <span>{t('dashboard.gitAhead')}</span>}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={cn(tdClass, 'text-right text-muted-foreground tabular-nums whitespace-nowrap')}>
                          {ws.size != null ? formatBytes(ws.size) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Orphaned Homes */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Home className="h-5 w-5 text-primary-soft" />
            <h3 className="text-sm font-semibold">{t('dashboard.orphanedHomes')}</h3>
            {cleanup && cleanup.orphanedHomes.length > 0 && (
              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
                {cleanup.orphanedHomes.length}
              </span>
            )}
          </div>
          {cleanup && cleanup.orphanedHomes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('dashboard.noOrphanedHomes')}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse">
                <thead className="bg-muted/30">
                  <tr>
                    <th scope="col" className={cn(thClass, 'w-10 leading-none')}>
                      <Checkbox
                        checked={homeCheckState}
                        onCheckedChange={toggleAllHomes}
                      />
                    </th>
                    <th scope="col" className={thClass}>Agent ID</th>
                    <th scope="col" className={thClass}>Path</th>
                    <th scope="col" className={cn(thClass, 'text-right')}>{t('dashboard.size')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cleanup?.orphanedHomes.map((home, idx) => (
                    <tr
                      key={home.agentId}
                      onClick={() => toggleHome(home.agentId)}
                      className={cn(
                        'cursor-pointer border-t border-border transition-colors',
                        selectedHomes.has(home.agentId)
                          ? 'bg-primary/5'
                          : 'hover:bg-muted/30',
                        idx === 0 && 'border-t-0',
                      )}
                    >
                      <td className={checkTdClass} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedHomes.has(home.agentId)}
                          onCheckedChange={() => toggleHome(home.agentId)}
                        />
                      </td>
                      <td className={cn(tdClass, 'font-medium whitespace-nowrap font-mono text-xs')}>
                        {home.agentId.slice(0, 12)}
                      </td>
                      <td className={cn(tdClass, 'text-muted-foreground truncate max-w-0')}>
                        <span className="block truncate" title={home.path}>{home.path}</span>
                      </td>
                      <td className={cn(tdClass, 'text-right text-muted-foreground tabular-nums whitespace-nowrap')}>
                        {home.size != null ? formatBytes(home.size) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Unused Docker Images */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <SwatchBook className="h-5 w-5 text-primary-soft" />
            <h3 className="text-sm font-semibold">{t('dashboard.unusedImages')}</h3>
            {cleanup && cleanup.unusedDockerImages.length > 0 && (
              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
                {cleanup.unusedDockerImages.length}
              </span>
            )}
          </div>
          {cleanup && cleanup.unusedDockerImages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('dashboard.noUnusedImages')}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse">
                <thead className="bg-muted/30">
                  <tr>
                    <th scope="col" className={cn(thClass, 'w-10 leading-none')}>
                      <Checkbox
                        checked={imageCheckState}
                        onCheckedChange={toggleAllImages}
                      />
                    </th>
                    <th scope="col" className={thClass}>Image</th>
                    <th scope="col" className={cn(thClass, 'text-right')}>{t('dashboard.imageSize')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cleanup?.unusedDockerImages.map((img, idx) => (
                    <tr
                      key={img.id}
                      onClick={() => toggleImage(img.imageRef)}
                      className={cn(
                        'cursor-pointer border-t border-border transition-colors',
                        selectedImages.has(img.imageRef)
                          ? 'bg-primary/5'
                          : 'hover:bg-muted/30',
                        idx === 0 && 'border-t-0',
                      )}
                    >
                      <td className={checkTdClass} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedImages.has(img.imageRef)}
                          onCheckedChange={() => toggleImage(img.imageRef)}
                        />
                      </td>
                      <td className={cn(tdClass, 'text-muted-foreground truncate max-w-0')}>
                        <span className="block truncate font-mono" title={img.imageRef}>
                          {img.imageRef}
                        </span>
                      </td>
                      <td className={cn(tdClass, 'text-right text-muted-foreground tabular-nums whitespace-nowrap')}>
                        {formatBytes(img.size)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </>
        )}
      </div>
    </ContentShell>
  );
}
