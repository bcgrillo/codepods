import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2, GitFork } from 'lucide-react';
import { useConfig, useUpdateConfig } from '../../hooks/useConfig';
import type { CentralRepoConfig } from '@codepods/shared-types';
import { SectionHeader } from '../ui/SectionHeader';
import { TextField } from '../ui/TextField';
import { SaveButton } from '../ui/SaveButton';
import { FormContainer } from '../ui/FormContainer';
import { ContentShell } from '../ContentShell';

type Kind = 'templates' | 'providers';

/**
 * Settings section for the central (marketplace) git repositories used to
 * discover templates and AI providers. Users can edit the git URL + branch and
 * add/remove repositories. The `cachedRef` value is hidden (managed by the
 * backend on discovery).
 */
export function CentralReposSettingsSection() {
  const { t } = useTranslation();
  const { data: config, isLoading } = useConfig();
  const updateConfig = useUpdateConfig();

  const [templates, setTemplates] = useState<CentralRepoConfig[] | null>(null);
  const [providers, setProviders] = useState<CentralRepoConfig[] | null>(null);
  const [saved, setSaved] = useState(false);

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tpls = templates ?? config.templateRepositories ?? [];
  const provs = providers ?? config.providerRepositories ?? [];

  const setKind = (kind: Kind, value: CentralRepoConfig[]) => {
    if (kind === 'templates') setTemplates(value);
    else setProviders(value);
  };

  const dirty =
    templates != null || providers != null;

  const handleSave = () => {
    updateConfig.mutate(
      {
        templateRepositories: tpls,
        providerRepositories: provs,
      },
      {
        onSuccess: () => {
          setTemplates(null);
          setProviders(null);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  return (
    <ContentShell
      title={t('repositories.title')}
      icon={GitFork}
      subtitle={`${t('repositories.hint')} ${t('repositories.discoveryHint')}`}
      actions={[
        <SaveButton
          key="save"
          onSave={handleSave}
          dirty={dirty}
          saving={updateConfig.isPending}
          saved={saved}
          saveLabel={t('common.save')}
          savedLabel={t('settings.saved')}
        />,
      ]}
    >
      <FormContainer className="space-y-8 py-4">
        <RepoList
          title={t('repositories.templates')}
          items={tpls}
          onChange={(v) => setKind('templates', v)}
        />
        <RepoList
          title={t('repositories.providers')}
          items={provs}
          onChange={(v) => setKind('providers', v)}
        />
      </FormContainer>
    </ContentShell>
  );
}

function RepoList({
  title,
  items,
  onChange,
}: {
  title: string;
  items: CentralRepoConfig[];
  onChange: (items: CentralRepoConfig[]) => void;
}) {
  const { t } = useTranslation();

  const update = (index: number, patch: Partial<CentralRepoConfig>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <section className="space-y-3">
      <SectionHeader title={title} icon={<GitFork className="h-4 w-4 text-muted-foreground" />} />
      {items.map((repo, i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-secondary-item/50 p-4 space-y-3"
        >
          <div className="space-y-3">
            <TextField
              label={t('repositories.url')}
              value={repo.url}
              onChange={(v) => update(i, { url: v })}
            />
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <TextField
                  label={t('repositories.branch')}
                  value={repo.branch}
                  onChange={(v) => update(i, { branch: v })}
                />
              </div>
              <button
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                title={t('repositories.remove')}
                className="p-2 rounded bg-secondary-item text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, { url: '', branch: 'main', cachedRef: '' }])}
        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded bg-secondary-item hover:bg-secondary-item/80 text-foreground transition-colors"
      >
        <Plus className="w-4 h-4" />
        {t('repositories.add')}
      </button>
    </section>
  );
}

