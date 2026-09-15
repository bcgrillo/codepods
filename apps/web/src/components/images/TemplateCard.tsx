import { useTranslation } from 'react-i18next';
import { Download, Info, Loader2, Pencil, RefreshCw } from 'lucide-react';
import type { ImageTemplate, DiscoveredTemplate } from '@codepods/shared-types';
import { TemplateIcon } from '../templates/TemplateIcon';
import { StatusDot } from '../SecondaryList';
import { useBuildStore } from '../../store/buildStore';
import { useUpdateImageTemplate, useCreateImageTemplate } from '../../hooks/useAgents';
import { cn } from '@/lib/utils';

function repoFileUrl(repoPath: string, file: string | null | undefined): string | null {
  if (!file || file.trim() === '') return null;
  return `/api/central-repos/repo-file/templates/${repoPath}/${file}`;
}

interface ConfiguredCardProps {
  template: ImageTemplate;
  onSelect: () => void;
  onEdit: () => void;
}

function ConfiguredCard({ template, onSelect, onEdit }: ConfiguredCardProps) {
  const { t } = useTranslation();
  const updateTemplate = useUpdateImageTemplate();
  const buildState = useBuildStore((s) => s.builds[template.id]);
  const isBuilding = buildState?.isBuilding ?? false;
  const startBuild = useBuildStore((s) => s.startBuild);

  const hasImage = !!template.lastBuiltImageRef;
  const statusType = !template.enabled ? 'inactive' : isBuilding ? 'warning' : hasImage ? 'active' : 'inactive';
  const statusLabel = !template.enabled
    ? t('images.disabled')
    : isBuilding
      ? t('images.building')
      : hasImage
        ? t('images.built')
        : t('images.notBuilt');

  const serviceCount = template.manifest?.services?.length ?? 0;

  return (
    <div
      className="group flex flex-col rounded-lg border border-border bg-card/50 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30"
        >
          <TemplateIcon
            icon={template.icon}
            iconDark={template.iconDark}
            className="h-7 w-7"
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSelect}
              className="truncate text-left text-sm font-semibold hover:text-primary"
            >
              {template.name}
            </button>
            <StatusDot status={statusType} />
          </div>
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
          {serviceCount > 0 && (
            <span className="ml-2 text-[10px] text-muted-foreground/70">
              {serviceCount} {t('images.services', { defaultValue: 'services' })}
            </span>
          )}
        </div>
      </div>

      {template.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
      )}

      <div className="mt-auto flex items-center gap-1 pt-3">
        <button
          type="button"
          onClick={() => updateTemplate.mutate({ id: template.id, dto: { enabled: !template.enabled } })}
          disabled={updateTemplate.isPending}
          className={cn(
            'btn-icon',
            template.enabled ? 'text-emerald-500' : 'text-muted-foreground',
          )}
          title={template.enabled ? t('images.disable') : t('images.enable')}
        >
          <span className={cn('h-2 w-2 rounded-full', template.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="btn-icon"
          title={t('images.detail.edit', { defaultValue: 'Edit' })}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="btn-icon"
          title={t('images.detail.buildInfo', { defaultValue: 'Build details' })}
        >
          <Info className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => startBuild(template.id, true)}
          disabled={isBuilding}
          className="btn-icon ml-auto"
          title={t('images.ensure.cta')}
        >
          {isBuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

interface DiscoveredCardProps {
  discovered: DiscoveredTemplate;
}

function DiscoveredCard({ discovered: dt }: DiscoveredCardProps) {
  const { t } = useTranslation();
  const createTemplate = useCreateImageTemplate();
  const icon = repoFileUrl(dt.repoPath, dt.icon);
  const iconDark = repoFileUrl(dt.repoPath, dt.iconDark);
  const serviceCount = dt.services.length;

  const handleAdd = () => {
    createTemplate.mutate({
      name: dt.displayName,
      repoUrl: dt.repoUrl,
      repoPath: dt.repoPath || '.',
      branch: dt.branch || 'main',
    });
  };

  return (
    <div className="group flex flex-col rounded-lg border border-dashed border-border bg-card/30 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30">
          <TemplateIcon icon={icon} iconDark={iconDark} className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{dt.displayName}</span>
            <StatusDot status="inactive" />
          </div>
          <span className="text-xs text-muted-foreground">{t('images.discovered.fromRepo')}</span>
          {serviceCount > 0 && (
            <span className="ml-2 text-[10px] text-muted-foreground/70">
              {serviceCount} {t('images.services', { defaultValue: 'services' })}
            </span>
          )}
        </div>
      </div>

      {dt.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{dt.description}</p>
      )}

      <div className="mt-auto flex items-center pt-3">
        <button
          type="button"
          onClick={handleAdd}
          disabled={createTemplate.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          {createTemplate.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {t('images.discovered.add')}
        </button>
      </div>
    </div>
  );
}

function CustomCard({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-transparent p-4 text-center transition-colors hover:border-primary hover:bg-primary/5 min-h-[140px]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
        <span className="text-xl font-light">+</span>
      </span>
      <span className="text-sm font-medium text-muted-foreground">{t('images.create.custom')}</span>
    </button>
  );
}

export { ConfiguredCard, DiscoveredCard, CustomCard };