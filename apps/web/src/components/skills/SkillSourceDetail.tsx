import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Pencil, RefreshCw, X } from 'lucide-react';
import { useSkillSource, useSkillsBySource, useRemoveSkillSource, useUpdateSkillSource, useSyncSkillSource } from '../../hooks/useSkills';
import { BookMarked, FileBadge } from 'lucide-react';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { ConfirmDeleteButton } from '../ui/ConfirmDeleteButton';
import { SectionHeader } from '../ui/SectionHeader';
import { IconButton } from '../ui/IconButton';
import { inputCls } from '../ui/styles';
import { Field } from '../ui/Field';
import { PrimaryButton, SecondaryButton } from '../ui/buttons';
import { SkillCard } from './SkillCard';
import { ContentShell } from '../ContentShell';

interface SkillSourceDetailProps {
  sourceId: number | null;
}

export function SkillSourceDetail({ sourceId }: SkillSourceDetailProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: source, isLoading } = useSkillSource(sourceId);
  const { data: skills } = useSkillsBySource(sourceId);
  const updateSource = useUpdateSkillSource();
  const removeSource = useRemoveSkillSource();
  const syncSource = useSyncSkillSource();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGitUrl, setEditGitUrl] = useState('');
  const [editSubPath, setEditSubPath] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (source) {
      setEditName(source.name);
      setEditGitUrl(source.gitUrl ?? '');
      setEditSubPath(source.subPath ?? '');
      setEditBranch(source.branch ?? '');
      setError(null);
      setIsEditing(false);
    }
  }, [source?.id]);

  if (!sourceId) {
    return (
      <div className="flex h-full select-none items-center justify-center text-sm text-muted-foreground">
        {t('skills.selectSource')}
      </div>
    );
  }

  if (isLoading || !source) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  const handleToggleEnabled = async () => {
    try {
      await updateSource.mutateAsync({ id: source.id, dto: { enabled: !source.enabled } });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleSync = async () => {
    try {
      await syncSource.mutateAsync(source.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleSave = async () => {
    setError(null);
    try {
      await updateSource.mutateAsync({
        id: source.id,
        dto: {
          name: editName.trim(),
          gitUrl: editGitUrl.trim() || undefined,
          subPath: editSubPath.trim() || undefined,
          branch: editBranch.trim() || undefined,
        },
      });
      setIsEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('skills.saveFailed'));
    }
  };

  const handleRemove = async () => {
    try {
      await removeSource.mutateAsync(source.id);
      navigate('/skills/local');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setConfirmDelete(false);
    }
  };

  const SourceIcon = source.type === 'skill' ? FileBadge : BookMarked;

  return (
    <ContentShell
      title={source.name}
      icon={SourceIcon}
      badges={
        !source.enabled
          ? [{ label: t('common.disabled'), variant: 'secondary' as const }]
          : undefined
      }
      actions={[
        <button
          key="sync"
          onClick={handleSync}
          disabled={syncSource.isPending}
          className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary-item disabled:opacity-50"
        >
          <RefreshCw className={syncSource.isPending ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
          {t('skills.sync')}
        </button>,
        <ToggleSwitch
          key="toggle"
          checked={source.enabled}
          onChange={handleToggleEnabled}
          disabled={updateSource.isPending}
          labelOn={t('skills.disable')}
          labelOff={t('skills.enable')}
        />,
        <ConfirmDeleteButton
          key="delete"
          onDelete={handleRemove}
          confirming={confirmDelete}
          onConfirmToggle={setConfirmDelete}
          pending={removeSource.isPending}
          deleteTitle={t('skills.delete')}
          confirmTitle={t('common.confirm')}
        />,
      ]}
    >
      <div className="px-4 py-4 space-y-6">
        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Source config */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader size="sm" title={t('skills.sourceSettings')} />
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary-item"
              >
                <Pencil className="h-3 w-3" />
                {t('skills.editSource')}
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <IconButton
                  onClick={handleSave}
                  loading={updateSource.isPending}
                  icon={<Check className="h-4 w-4" />}
                  title={t('common.save')}
                  hover="hover:bg-primary/15 hover:text-primary-soft"
                />
                <IconButton
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(source.name);
                    setEditGitUrl(source.gitUrl ?? '');
                    setEditSubPath(source.subPath ?? '');
                    setEditBranch(source.branch ?? '');
                    setError(null);
                  }}
                  icon={<X className="h-4 w-4" />}
                  title={t('common.cancel')}
                  hover="hover:bg-primary/15 hover:text-primary-soft"
                />
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-3 rounded-lg border border-border bg-secondary-item/50 p-3">
              <Field label={t('skills.name')}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} autoFocus />
              </Field>
              <Field label={t('skills.gitUrl')}>
                <input value={editGitUrl} onChange={(e) => setEditGitUrl(e.target.value)} className={inputCls} placeholder="https://github.com/owner/repo.git" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('skills.subPath')}>
                  <input value={editSubPath} onChange={(e) => setEditSubPath(e.target.value)} className={inputCls} placeholder="skills/" />
                </Field>
                <Field label={t('skills.branch')}>
                  <input value={editBranch} onChange={(e) => setEditBranch(e.target.value)} className={inputCls} placeholder="main" />
                </Field>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <SecondaryButton onClick={() => setIsEditing(false)}>{t('common.cancel')}</SecondaryButton>
                <PrimaryButton onClick={handleSave} disabled={updateSource.isPending}>
                  {updateSource.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <>
              <ReadonlyField label={t('skills.typeLabel')} value={t(`skills.type.${source.type}`)} />
              <ReadonlyField label={t('skills.gitUrl')} value={source.gitUrl ?? '—'} />
              <ReadonlyField label={t('skills.subPath')} value={source.subPath ?? '—'} />
              <ReadonlyField label={t('skills.branch')} value={source.branch ?? '—'} />
              <ReadonlyField label={t('skills.lastSynced')} value={source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString() : '—'} />
              <ReadonlyField label={t('skills.commitSha')} value={source.commitSha ?? '—'} />
            </>
          )}
        </section>

        {/* Discovered skills */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionHeader size="sm" title={t('skills.discoveredSkills')} />
            {skills && skills.length > 0 && (
              <span className="rounded bg-secondary-item px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {skills.length}
              </span>
            )}
          </div>
          {!skills || skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('skills.noSkills')}</p>
          ) : (
            <div className="space-y-2">
              {skills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>
          )}
        </section>
      </div>
    </ContentShell>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm text-foreground">{value}</p>
    </div>
  );
}
