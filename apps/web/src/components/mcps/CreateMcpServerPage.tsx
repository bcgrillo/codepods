import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useCreateMcpServer } from '../../hooks/useMcpServers';
import { useCredentials } from '../../hooks/useCredentials';
import type { CreateMcpServerDto } from '@codepods/sdk';
import { CreatePage } from '../layout/CreatePage';
import { FormContainer } from '../ui/FormContainer';
import { Field } from '../ui/Field';
import { ToggleRow } from '../ui/ToggleRow';
import { inputCls } from '../ui/styles';
import { PrimaryButton, SecondaryButton } from '../ui/buttons';

export function CreateMcpServerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createServer = useCreateMcpServer();
  const { data: credentials } = useCredentials();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [url, setUrl] = useState('');
  const [credentialId, setCredentialId] = useState<string>('');
  const [enabled, setEnabled] = useState(true);
  const [connectAllAgents, setConnectAllAgents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('agents.nameRequired'));
      return;
    }
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError(t('mcps.urlRequired'));
      return;
    }
    const dto: CreateMcpServerDto = {
      name: trimmedName,
      slug: slug.trim() || undefined,
      transport: 'http',
      url: trimmedUrl,
      credentialId: credentialId ? Number(credentialId) : null,
      enabled,
      connectAllAgents,
    };
    setError(null);
    try {
      const created = await createServer.mutateAsync(dto);
      navigate(`/mcps/${encodeURIComponent(created.slug)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <CreatePage
      title={t('mcps.create.title')}
      description={t('mcps.create.description')}
      onBack={() => navigate('/mcps')}
    >
      <FormContainer className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t('mcps.name')}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="github-mcp"
              className={inputCls}
              autoFocus
            />
          </Field>

          <Field label={t('mcps.slug')} hint={t('mcps.slugHint')}>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="github"
              className={inputCls}
            />
          </Field>

          <Field label={t('mcps.url')} hint={t('mcps.urlHint')}>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/sse"
              className={inputCls}
            />
          </Field>

          <Field label={t('mcps.credential')}>
            <select
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
              className={inputCls}
            >
              <option value="">{t('mcps.noCredential')}</option>
              {(credentials ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <ToggleRow
            label={t('common.enabled')}
            hint={t('mcps.enabledHint')}
            checked={enabled}
            onChange={() => setEnabled((v) => !v)}
          />

          <ToggleRow
            label={t('mcps.connectAllAgents')}
            hint={t('mcps.connectAllAgentsHint')}
            checked={connectAllAgents}
            onChange={() => setConnectAllAgents((v) => !v)}
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <SecondaryButton onClick={() => navigate('/mcps')}>
              {t('common.close')}
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={createServer.isPending}>
              {createServer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('mcps.create.submit')}
            </PrimaryButton>
          </div>
        </form>
      </FormContainer>
    </CreatePage>
  );
}
