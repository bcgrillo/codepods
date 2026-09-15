import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useCreateImageTemplate } from '../../hooks/useAgents';
import { CreatePage } from '../layout/CreatePage';
import { FormContainer } from '../ui/FormContainer';
import { Field } from '../ui/Field';
import { inputCls } from '../ui/styles';
import { PrimaryButton, SecondaryButton } from '../ui/buttons';

function computeTemplateName(repoUrl: string, repoPath: string): string {
  const trimmedUrl = repoUrl.trim();
  if (!trimmedUrl) return '';
  const normalizedUrl = trimmedUrl
    .replace(/^git@[^:]+:/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const parts = normalizedUrl.split(/[/:]/).filter(Boolean);
  const owner = parts[parts.length - 2] ?? '';
  const repo = parts[parts.length - 1] ?? '';
  if (!owner || !repo) return '';
  const pathPart = repoPath.trim();
  if (!pathPart || pathPart === '.') return `${owner}/${repo}`;
  const normalizedPath = pathPart.replace(/^\/+/, '').replace(/[\\/]+/g, '-');
  return `${owner}/${repo}-${normalizedPath}`;
}

export function TemplateEditView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createTemplate = useCreateImageTemplate();

  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [repoPath, setRepoPath] = useState('.');
  const [branch, setBranch] = useState('main');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);

  useEffect(() => {
    if (nameTouched) return;
    setName(computeTemplateName(repoUrl, repoPath));
  }, [repoUrl, repoPath, nameTouched]);

  const goBack = () => navigate('/agents/templates');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedUrl = repoUrl.trim();
    const trimmedPath = repoPath.trim() || '.';
    const trimmedBranch = branch.trim() || 'main';
    const trimmedName = name.trim();

    if (!trimmedUrl || !trimmedName) {
      setSubmitError(t('images.create.validationRequired'));
      return;
    }

    setSubmitError(null);

    try {
      const created = await createTemplate.mutateAsync({
        name: trimmedName,
        repoUrl: trimmedUrl,
        repoPath: trimmedPath,
        branch: trimmedBranch,
      });
      navigate(`/agents/templates/${encodeURIComponent(created.name)}`);
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : t('common.error'));
    }
  };

  return (
    <CreatePage
      title={t('images.create.title')}
      description={t('images.create.description')}
      onBack={goBack}
    >
      <FormContainer className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t('images.create.repoUrlLabel')}>
            <input
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value);
                setNameTouched(false);
              }}
              placeholder="https://github.com/org/repo.git"
              className={inputCls}
              autoFocus
            />
          </Field>

          <Field label={t('images.create.repoPathLabel')}>
            <input
              value={repoPath}
              onChange={(e) => {
                setRepoPath(e.target.value);
                setNameTouched(false);
              }}
              placeholder="."
              className={inputCls}
            />
          </Field>

          <Field label={t('images.create.branchLabel')}>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className={inputCls}
            />
          </Field>

          <Field label={t('images.create.nameLabel')} hint={t('images.create.nameHelp')}>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
              }}
              placeholder="org/template-repo"
              className={inputCls}
            />
          </Field>

          <a
            href="https://github.com/bcgrillo/codepods/tree/main/docs/templates.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80"
          >
            <ExternalLink className="h-3 w-3" />
            {t('images.create.docsLink')}
          </a>

          {submitError && <p className="text-xs text-destructive">{submitError}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <SecondaryButton onClick={goBack}>{t('common.close')}</SecondaryButton>
            <PrimaryButton type="submit" disabled={createTemplate.isPending}>
              {createTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('images.create.submit')}
            </PrimaryButton>
          </div>
        </form>
      </FormContainer>
    </CreatePage>
  );
}
