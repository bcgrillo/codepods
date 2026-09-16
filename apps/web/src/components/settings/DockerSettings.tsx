import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ExternalLink, Container } from 'lucide-react';
import { useConfig, useUpdateConfig, useReloadConfig } from '../../hooks/useConfig';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { SectionHeader } from '../ui/SectionHeader';
import { FormContainer } from '../ui/FormContainer';
import { SettingsToolbar } from '../ui/SettingsToolbar';
import { inputCls, inputCompactCls } from '../ui/styles';
import type { DockerRunConfig } from '@codepods/shared-types';

export function DockerSettingsSection() {
  const { t } = useTranslation();
  const { data: config, isLoading } = useConfig();
  const updateConfig = useUpdateConfig();
  const reloadConfig = useReloadConfig();

  const [dockerEdit, setDockerEdit] = useState<Partial<DockerRunConfig>>({});
  const [saved, setSaved] = useState(false);

  const dirty = Object.keys(dockerEdit).length > 0;
  useUnsavedChangesGuard(dirty);

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const docker: DockerRunConfig = { ...config.docker, ...dockerEdit };
  const handleSave = () => {
    if (Object.keys(dockerEdit).length === 0) return;
    updateConfig.mutate({ docker: { ...config.docker, ...dockerEdit } }, {
      onSuccess: () => {
        setDockerEdit({});
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  };

  const setDocker = <K extends keyof DockerRunConfig>(key: K, value: DockerRunConfig[K]) =>
    setDockerEdit({ ...dockerEdit, [key]: value });

  return (
    <SettingsToolbar
      title={t('settings.docker')}
      icon={Container}
      dirty={dirty}
      saved={saved}
      saving={updateConfig.isPending}
      reloadPending={reloadConfig.isPending}
      onSave={handleSave}
      onReload={() => {
        setDockerEdit({});
        setSaved(false);
        reloadConfig.mutate();
      }}
      saveLabel={t('common.save')}
      savedLabel={t('settings.saved')}
      reloadLabel={t('settings.reload')}
      reloadDirtyConfirm={t('settings.unsavedRefreshWarning')}
    >
      <FormContainer className="space-y-4 py-4">
        <p className="text-xs text-muted-foreground -mt-1">{t('settings.dockerHint')}</p>

        {/* --- Lifecycle --- */}
        <SettingsSection title={t('settings.dockerLifecycle')}>
          <ToggleRow
            label={t('settings.dockerAutoRemove')}
            param="--rm"
            hint={t('settings.dockerAutoRemoveHint')}
            checked={docker.autoRemove}
            onChange={() => setDocker('autoRemove', !docker.autoRemove)}
          />
        </SettingsSection>

        {/* --- Filesystem --- */}
        <SettingsSection title={t('settings.dockerFilesystem')}>
          <ToggleRow
            label={t('settings.dockerReadOnly')}
            param="--read-only"
            hint={t('settings.dockerReadOnlyHint')}
            checked={docker.readOnly}
            onChange={() => setDocker('readOnly', !docker.readOnly)}
          />
          <div className="flex items-end justify-between gap-3 py-1.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-foreground">{t('settings.dockerTmpfsSize')}</span>
                <ParamBadge>--tmpfs /tmp</ParamBadge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t('settings.dockerTmpfsHint')}</p>
            </div>
            <input
              className={`${inputCompactCls} w-28 flex-shrink-0`}
              value={docker.tmpfsSize}
              placeholder="100m"
              onChange={(e) => setDocker('tmpfsSize', e.target.value)}
            />
          </div>
        </SettingsSection>

        {/* --- Capabilities & privileges --- */}
        <SettingsSection title={t('settings.dockerCapabilities')}>
          <ToggleRow
            label={t('settings.dockerCapDropAll')}
            param="--cap-drop=ALL"
            hint={t('settings.dockerCapDropAllHint')}
            checked={docker.capDropAll}
            onChange={() => setDocker('capDropAll', !docker.capDropAll)}
          />
          <ToggleRow
            label={t('settings.dockerDropNetRaw')}
            param="--cap-drop=NET_RAW"
            hint={
              docker.capDropAll
                ? t('settings.dockerDropNetRawHintCovered')
                : t('settings.dockerDropNetRawHint')
            }
            checked={docker.capDropAll ? false : docker.dropNetRaw}
            onChange={() => setDocker('dropNetRaw', !docker.dropNetRaw)}
            disabled={docker.capDropAll}
          />
          <ToggleRow
            label={t('settings.dockerNoNewPrivileges')}
            param="--security-opt=no-new-privileges"
            hint={t('settings.dockerNoNewPrivilegesHint')}
            checked={docker.noNewPrivileges}
            onChange={() => setDocker('noNewPrivileges', !docker.noNewPrivileges)}
          />
          <ToggleRow
            label={t('settings.dockerUser')}
            param="--user <uid>:<gid>"
            hint={t('settings.dockerUserHint')}
            checked={docker.forceNonRootUser}
            onChange={() => setDocker('forceNonRootUser', !docker.forceNonRootUser)}
          />
        </SettingsSection>

        {/* --- Resource limits --- */}
        <SettingsSection title={t('settings.dockerResources')}>
          <ToggleInputRow
            label={t('settings.dockerPidsLimit')}
            param="--pids-limit"
            hint={t('settings.dockerPidsLimitHint')}
            checked={docker.pidsLimit !== null}
            onToggle={() => setDocker('pidsLimit', docker.pidsLimit === null ? 128 : null)}
            value={docker.pidsLimit !== null ? String(docker.pidsLimit) : ''}
            onValue={(v) => setDocker('pidsLimit', Number(v) || 0)}
            placeholder="128"
          />
          <ToggleInputRow
            label={t('settings.dockerMemoryLimit')}
            param="--memory"
            hint={t('settings.dockerMemoryLimitHint')}
            checked={docker.memoryLimit !== ''}
            onToggle={() => setDocker('memoryLimit', docker.memoryLimit === '' ? '512m' : '')}
            value={docker.memoryLimit}
            onValue={(v) => setDocker('memoryLimit', v)}
            placeholder="512m"
          />
          <ToggleInputRow
            label={t('settings.dockerCpuLimit')}
            param="--cpus"
            hint={t('settings.dockerCpuLimitHint')}
            checked={docker.cpuLimit > 0}
            onToggle={() => setDocker('cpuLimit', docker.cpuLimit > 0 ? 0 : 1)}
            value={docker.cpuLimit > 0 ? String(docker.cpuLimit) : ''}
            onValue={(v) => setDocker('cpuLimit', Number(v) || 0)}
            placeholder="1"
          />
        </SettingsSection>

        {/* --- Runtime --- */}
        <SettingsSection title={t('settings.dockerRuntime')}>
          <ToggleRow
            label={t('settings.dockerRuntimeRunsc')}
            param="--runtime=runsc"
            hint={
              <>
                {t('settings.dockerRuntimeRunscHint')}{' '}
                <a
                  href="https://gvisor.dev"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:text-primary-soft inline-flex items-center gap-0.5"
                >
                  gVisor <ExternalLink className="w-3 h-3" />
                </a>
              </>
            }
            checked={docker.runtime === 'runsc'}
            onChange={() => setDocker('runtime', docker.runtime === 'runsc' ? '' : 'runsc')}
          />
        </SettingsSection>

        {/* --- Custom args --- */}
        <SettingsSection title={t('settings.dockerCustomArgs')}>
          <div className="py-1.5">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-sm text-foreground">{t('settings.dockerCustomArgsLabel')}</span>
              <ParamBadge>e.g. --ulimit nofile=1024:1024</ParamBadge>
            </div>
            <input
              className={inputCls}
              value={docker.customArgs}
              onChange={(e) => setDocker('customArgs', e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">{t('settings.dockerCustomArgsHint')}</p>
          </div>
        </SettingsSection>
      </FormContainer>
    </SettingsToolbar>
  );
}

// ---------------------------------------------------------------------------
// Shared layout helpers
// ---------------------------------------------------------------------------

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5 pt-3 border-t border-border">
      <SectionHeader title={title} />
      {children}
    </section>
  );
}

function ParamBadge({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary-item text-muted-foreground border border-border whitespace-nowrap">
      {children}
    </code>
  );
}

function ToggleRow({
  label,
  hint,
  param,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: React.ReactNode;
  param?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 py-1.5 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-foreground">{label}</span>
          {param && <ParamBadge>{param}</ParamBadge>}
        </div>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0 pt-0.5">
        <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}

/** Toggle + inline numeric/text input shown only when the toggle is on. */
function ToggleInputRow({
  label,
  hint,
  param,
  checked,
  onToggle,
  value,
  onValue,
  placeholder,
}: {
  label: string;
  hint?: string;
  param?: string;
  checked: boolean;
  onToggle: () => void;
  value: string;
  onValue: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-foreground">{label}</span>
            {param && <ParamBadge>{param}</ParamBadge>}
          </div>
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
          {checked && (
            <input
              className={`${inputCompactCls} w-24`}
              value={value}
              placeholder={placeholder}
              onChange={(e) => onValue(e.target.value)}
            />
          )}
          <ToggleSwitch checked={checked} onChange={onToggle} />
        </div>
      </div>
    </div>
  );
}