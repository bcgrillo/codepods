import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, CircleCheck, CircleX, Copy, Loader2, Pencil, RefreshCw, X } from 'lucide-react';
import { useMcpServer, useRemoveMcpServer, useUpdateMcpServer, useMcpServerTools, useSyncMcpServerTools } from '../../hooks/useMcpServers';
import { useCredentials } from '../../hooks/useCredentials';
import type { UpdateMcpServerDto } from '@codepods/sdk';
import { McpIcon } from '../icons/McpIcon';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { ConfirmDeleteButton } from '../ui/ConfirmDeleteButton';
import { SectionHeader } from '../ui/SectionHeader';
import { IconButton } from '../ui/IconButton';
import { inputCls } from '../ui/styles';
import { Field } from '../ui/Field';
import { PrimaryButton, SecondaryButton } from '../ui/buttons';
import { ContentShell } from '../ContentShell';

interface McpServerDetailProps {
  serverId: number | null;
}

export function McpServerDetail({ serverId }: McpServerDetailProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: server, isLoading } = useMcpServer(serverId);
  const { data: credentials } = useCredentials();
  const updateServer = useUpdateMcpServer();
  const removeServer = useRemoveMcpServer();
  const { data: toolsData, isLoading: toolsLoading } = useMcpServerTools(server?.enabled ? serverId : null);
  const syncTools = useSyncMcpServerTools();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editCredentialId, setEditCredentialId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (server) {
      setEditName(server.name);
      setEditSlug(server.slug);
      setEditUrl(server.url ?? '');
      setEditCredentialId(server.credentialId ? String(server.credentialId) : '');
      setError(null);
      setIsEditing(false);
    }
  }, [server?.id]);

  if (!serverId) {
    return (
      <div className="flex h-full select-none items-center justify-center text-sm text-muted-foreground">
        {t('mcps.selectServer')}
      </div>
    );
  }

  if (isLoading || !server) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  const handleToggleEnabled = async () => {
    try {
      await updateServer.mutateAsync({ id: server.id, dto: { enabled: !server.enabled } });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleSave = async () => {
    setError(null);
    const dto: UpdateMcpServerDto = {
      name: editName.trim(),
      slug: server.builtIn ? undefined : editSlug.trim() || undefined,
      url: server.builtIn ? undefined : editUrl.trim() || null,
      credentialId: editCredentialId ? Number(editCredentialId) : null,
    };
    try {
      await updateServer.mutateAsync({ id: server.id, dto });
      setIsEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('mcps.saveFailed'));
    }
  };

  const handleRemove = async () => {
    try {
      await removeServer.mutateAsync(server.id);
      navigate('/mcps');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setConfirmDelete(false);
    }
  };

  const handleSyncTools = async () => {
    try {
      await syncTools.mutateAsync(server.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const proxyEndpoint = `http://host.docker.internal:3000/api/mcp/${server.slug}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(proxyEndpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const linkedCredential = credentials?.find((c) => c.id === server.credentialId);

  return (
    <ContentShell
      title={server.name}
      icon={McpIcon}
      badges={[
        ...(server.builtIn ? [{ label: t('mcps.builtIn'), variant: 'secondary' as const }] : []),
        ...(!server.enabled ? [{ label: t('common.disabled'), variant: 'secondary' as const }] : []),
      ]}
      actions={[
        <ToggleSwitch
          key="toggle"
          checked={server.enabled}
          onChange={handleToggleEnabled}
          disabled={updateServer.isPending}
          labelOn={t('mcps.disable')}
          labelOff={t('mcps.enable')}
        />,
        ...(!server.builtIn ? [
          <ConfirmDeleteButton
            key="delete"
            onDelete={handleRemove}
            confirming={confirmDelete}
            onConfirmToggle={setConfirmDelete}
            pending={removeServer.isPending}
            deleteTitle={t('mcps.delete')}
            confirmTitle={t('common.confirm')}
          />,
        ] : []),
      ]}
    >
      <div className="px-4 py-4 space-y-6">
        {/* Per-slug MCP endpoint */}
        <section className="rounded-lg border border-border bg-secondary-item/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('mcps.proxyHint')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('mcps.proxyHintDescription')}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs text-foreground">
              {proxyEndpoint}
            </code>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary-item"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" /> {t('mcps.copied')}
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> {t('mcps.copy')}
                </>
              )}
            </button>
          </div>
        </section>

        {/* Server config */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeader size="sm" title={t('mcps.connectionSettings')} />
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary-item"
              >
                <Pencil className="h-3 w-3" />
                {t('mcps.editConnection')}
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <IconButton
                  onClick={handleSave}
                  loading={updateServer.isPending}
                  icon={<Check className="h-4 w-4" />}
                  title={t('common.save')}
                  hover="hover:bg-primary/15 hover:text-primary-soft"
                />
                <IconButton
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(server.name);
                    setEditSlug(server.slug);
                    setEditUrl(server.url ?? '');
                    setEditCredentialId(server.credentialId ? String(server.credentialId) : '');
                    setError(null);
                  }}
                  icon={<X className="h-4 w-4" />}
                  title={t('common.cancel')}
                  hover="hover:bg-primary/15 hover:text-primary-soft"
                />
              </div>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <ReadonlyField label={t('mcps.name')} value={server.name} />
            <ReadonlyField label={t('mcps.slug')} value={server.slug} />
          </div>
          <ReadonlyField
            label={t('mcps.url')}
            value={server.builtIn ? t('mcps.codepodsBuiltin') : (server.url ?? '—')}
          />
          <ReadonlyField
            label={t('mcps.credential')}
            value={linkedCredential ? linkedCredential.label : t('mcps.noCredential')}
          />
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary-item/50 p-3">
            <div>
              <p className="text-sm text-foreground">{t('mcps.connectAllAgents')}</p>
              <p className="text-xs text-muted-foreground">{t('mcps.connectAllAgentsHint')}</p>
            </div>
            <ToggleSwitch
              checked={server.connectAllAgents}
              onChange={async () => {
                try {
                  await updateServer.mutateAsync({ id: server.id, dto: { connectAllAgents: !server.connectAllAgents } });
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : t('common.error'));
                }
              }}
              disabled={updateServer.isPending}
              labelOn={t('common.enabled')}
              labelOff={t('common.disabled')}
            />
          </div>

          {isEditing && (
            <div className="space-y-3 rounded-lg border border-border bg-secondary-item/50 p-3">
              <Field label={t('mcps.name')}>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={inputCls}
                  autoFocus
                />
              </Field>
              {!server.builtIn && (
                <>
                  <Field label={t('mcps.slug')} hint={t('mcps.slugHint')}>
                    <input
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t('mcps.url')} hint={t('mcps.urlHint')}>
                    <input
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder="https://mcp.example.com/sse"
                      className={inputCls}
                    />
                  </Field>
                </>
              )}
              <Field label={t('mcps.credential')}>
                <select
                  value={editCredentialId}
                  onChange={(e) => setEditCredentialId(e.target.value)}
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
              <div className="flex justify-end gap-2 pt-1">
                <SecondaryButton onClick={() => setIsEditing(false)}>
                  {t('common.cancel')}
                </SecondaryButton>
                <PrimaryButton onClick={handleSave} disabled={updateServer.isPending}>
                  {updateServer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </PrimaryButton>
              </div>
            </div>
          )}
        </section>

        {/* Discovered tools */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionHeader size="sm" title={t('mcps.discoveredTools')} />
            <button
              onClick={handleSyncTools}
              disabled={syncTools.isPending || !server.enabled}
              className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary-item disabled:opacity-50"
            >
              <RefreshCw className={syncTools.isPending ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
              {t('mcps.syncTools')}
            </button>
          </div>
          {!server.enabled ? (
            <p className="text-sm text-muted-foreground">{t('mcps.toolsDisabled')}</p>
          ) : toolsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('common.loading')}
            </div>
          ) : toolsData ? (
            <>
              <div className="flex items-center gap-1.5 text-xs">
                {toolsData.reachable ? (
                  <>
                    <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-500">{t('mcps.reachable')}</span>
                  </>
                ) : (
                  <>
                    <CircleX className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-destructive">{t('mcps.unreachable')}</span>
                    {toolsData.error && <span className="text-muted-foreground">— {toolsData.error}</span>}
                  </>
                )}
                {toolsData.tools.length > 0 && (
                  <span className="ml-1 rounded bg-secondary-item px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {toolsData.tools.length}
                  </span>
                )}
              </div>
              {toolsData.tools.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('mcps.noTools')}</p>
              ) : (
                <div className="space-y-1.5">
                  {toolsData.tools.map((tool, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border/50 bg-secondary-item/50 px-3 py-2"
                    >
                      <code className="text-xs font-mono text-foreground">
                        {tool.name}
                      </code>
                      {tool.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{tool.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('mcps.noTools')}</p>
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
