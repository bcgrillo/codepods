import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileBadge, Loader2, Pencil, Upload, X, Check } from 'lucide-react';
import { useLocalSkills, useUploadLocalSkill, useRenameSkill, useDeleteSkill } from '../../hooks/useSkills';
import { SectionHeader } from '../ui/SectionHeader';
import { IconButton } from '../ui/IconButton';
import { ConfirmDeleteButton } from '../ui/ConfirmDeleteButton';
import { inputCls } from '../ui/styles';
import { ContentShell } from '../ContentShell';

export function LocalSkillsPanel() {
  const { t } = useTranslation();
  const { data: skills, isLoading } = useLocalSkills();
  const uploadSkill = useUploadLocalSkill();
  const renameSkill = useRenameSkill();
  const deleteSkill = useDeleteSkill();

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const baseName = file.name.replace(/\.(md|zip)$/i, '');
    setUploadName(baseName);
    setPendingFile(file);
    setError(null);
  };

  const handleUpload = async () => {
    if (!pendingFile || !uploadName.trim()) return;
    setError(null);
    try {
      await uploadSkill.mutateAsync({ name: uploadName.trim(), file: pendingFile });
      setPendingFile(null);
      setUploadName('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleCancelUpload = () => {
    setPendingFile(null);
    setUploadName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleRename = async (id: number) => {
    if (!renameValue.trim()) return;
    try {
      await renameSkill.mutateAsync({ id, name: renameValue.trim() });
      setRenamingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSkill.mutateAsync(id);
      setConfirmDeleteId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <ContentShell
      title={t('skills.local')}
      icon={FileBadge}
    >
      <div className="px-4 py-4 space-y-6">
        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Upload section */}
        <section className="space-y-3">
          <SectionHeader size="sm" title={t('skills.uploadSkill')} />
          <div className="rounded-lg border border-border bg-secondary-item/50 p-3 space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept=".md,.zip"
              onChange={handleFilePick}
              className="hidden"
              id="skill-file-input"
            />
            <label
              htmlFor="skill-file-input"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-secondary-item/30"
            >
              <Upload className="h-4 w-4" />
              {pendingFile ? pendingFile.name : t('skills.chooseFile')}
            </label>
            {pendingFile && (
              <div className="space-y-2">
                <input
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder={t('skills.skillName')}
                  className={inputCls}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleUpload}
                    disabled={!uploadName.trim() || uploadSkill.isPending}
                    className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {uploadSkill.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                    {t('skills.upload')}
                  </button>
                  <button
                    onClick={handleCancelUpload}
                    className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary-item"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Local skills list */}
        <section className="space-y-2">
          <SectionHeader size="sm" title={t('skills.localSkills')} />
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t('common.loading')}</span>
            </div>
          ) : !skills || skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('skills.noLocalSkills')}</p>
          ) : (
            <div className="space-y-2">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-secondary-item/50 p-3"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary-item">
                    <FileBadge className="h-4 w-4 text-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {renamingId === skill.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className={inputCls + ' flex-1'}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(skill.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                        />
                        <IconButton
                          onClick={() => handleRename(skill.id)}
                          loading={renameSkill.isPending}
                          icon={<Check className="h-4 w-4" />}
                          title={t('common.save')}
                          hover="hover:bg-primary/15 hover:text-primary-soft"
                        />
                        <IconButton
                          onClick={() => setRenamingId(null)}
                          icon={<X className="h-4 w-4" />}
                          title={t('common.cancel')}
                          hover="hover:bg-primary/15 hover:text-primary-soft"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-sm font-medium text-foreground">{skill.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {skill.description ?? skill.path ?? '—'}
                        </p>
                      </>
                    )}
                  </div>
                  {renamingId !== skill.id && (
                    <div className="flex items-center gap-0.5">
                      <IconButton
                        onClick={() => {
                          setRenamingId(skill.id);
                          setRenameValue(skill.name);
                        }}
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        title={t('skills.rename')}
                        hover="hover:bg-primary/15 hover:text-primary-soft"
                      />
                      <ConfirmDeleteButton
                        onDelete={() => handleDelete(skill.id)}
                        confirming={confirmDeleteId === skill.id}
                        onConfirmToggle={(v) => setConfirmDeleteId(v ? skill.id : null)}
                        pending={deleteSkill.isPending}
                        deleteTitle={t('skills.delete')}
                        confirmTitle={t('common.confirm')}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ContentShell>
  );
}