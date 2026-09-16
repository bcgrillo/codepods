import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useCreateSkillSource } from '../../hooks/useSkills';
import type { SkillSourceType } from '@codepods/shared-types';
import { CreatePage } from '../layout/CreatePage';
import { FormContainer } from '../ui/FormContainer';
import { Field } from '../ui/Field';
import { ToggleRow } from '../ui/ToggleRow';
import { ChoiceGrid, type ChoiceCard } from '../ui/ChoiceGrid';
import { inputCls } from '../ui/styles';
import { PrimaryButton, SecondaryButton } from '../ui/buttons';

export function CreateSkillSourcePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createSource = useCreateSkillSource();

  const [name, setName] = useState('');
  const [type, setType] = useState<SkillSourceType>('repo');
  const [gitUrl, setGitUrl] = useState('');
  const [subPath, setSubPath] = useState('');
  const [branch, setBranch] = useState('main');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('agents.nameRequired'));
      return;
    }
    const trimmedUrl = gitUrl.trim();
    if (!trimmedUrl) {
      setError(t('skills.gitUrlRequired'));
      return;
    }
    setError(null);
    try {
      const created = await createSource.mutateAsync({
        name: trimmedName,
        type,
        gitUrl: trimmedUrl,
        subPath: subPath.trim() || undefined,
        branch: branch.trim() || undefined,
        enabled,
      });
      navigate(`/skills/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <CreatePage
      title={t('skills.create.title')}
      description={t('skills.create.description')}
      onBack={() => navigate('/skills')}
    >
      <FormContainer className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t('skills.name')}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-skills"
              className={inputCls}
              autoFocus
            />
          </Field>

          <Field label={t('skills.typeLabel')} hint={t('skills.typeHint')}>
            <ChoiceGrid
              cards={[
                { id: 'repo', title: t('skills.type.repo'), description: t('skills.type.repoDesc') },
                { id: 'skill', title: t('skills.type.skill'), description: t('skills.type.skillDesc') },
              ] satisfies ChoiceCard[]}
              onSelect={(id) => setType(id as SkillSourceType)}
              selectedId={type}
              columns={2}
              cardLayout="horizontal"
            />
          </Field>

          <Field label={t('skills.gitUrl')} hint={t('skills.gitUrlHint')}>
            <input
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder="https://github.com/owner/repo.git"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('skills.subPath')} hint={t('skills.subPathHint')}>
              <input
                value={subPath}
                onChange={(e) => setSubPath(e.target.value)}
                placeholder="skills/"
                className={inputCls}
              />
            </Field>
            <Field label={t('skills.branch')}>
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className={inputCls}
              />
            </Field>
          </div>

          <ToggleRow
            label={t('common.enabled')}
            hint={t('skills.enabledHint')}
            checked={enabled}
            onChange={() => setEnabled((v) => !v)}
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <SecondaryButton onClick={() => navigate('/skills')}>
              {t('common.close')}
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={createSource.isPending}>
              {createSource.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('skills.create.submit')}
            </PrimaryButton>
          </div>
        </form>
      </FormContainer>
    </CreatePage>
  );
}
