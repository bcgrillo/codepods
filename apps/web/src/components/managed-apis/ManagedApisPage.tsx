import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, CloudCog, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useManagedApis, useCreateManagedApi, useUpdateManagedApi, useRemoveManagedApi } from '../../hooks/useManagedApis';
import { useCredentials } from '../../hooks/useCredentials';
import type { ManagedApi } from '@codepods/shared-types';
import type { CreateManagedApiDto, UpdateManagedApiDto } from '@codepods/sdk';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { ContentShell } from '../ContentShell';
import { ContentHeaderAction } from '../ContentHeader';
import { inputCls } from '../ui/styles';
import { Field } from '../ui/Field';
import { PrimaryButton, SecondaryButton } from '../ui/buttons';

export function ManagedApisPage() {
  const { t } = useTranslation();
  const { data: apis, isLoading } = useManagedApis();
  const { data: credentials } = useCredentials();
  const createApi = useCreateManagedApi();
  const updateApi = useUpdateManagedApi();
  const removeApi = useRemoveManagedApi();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const sortedApis = [...(apis ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ContentShell
      title={t('managedApis.title')}
      icon={CloudCog}
      actions={[
        <ContentHeaderAction
          key="add"
          icon={Plus}
          label={t('managedApis.newApi')}
          onClick={() => { setShowCreate(true); setEditingId(null); }}
        />,
      ]}
    >
      <div className="px-4 py-4 space-y-4">
        {/* Hint */}
        <section className="rounded-lg border border-border bg-secondary-item/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('managedApis.proxyHint')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('managedApis.proxyHintDescription')}</p>
        </section>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t('common.loading')}</span>
          </div>
        )}

        {showCreate && (
          <ApiEditor
            mode="create"
            credentials={credentials ?? []}
            onCancel={() => setShowCreate(false)}
            onSave={async (dto) => {
              const created = await createApi.mutateAsync(dto as CreateManagedApiDto);
              setShowCreate(false);
              setEditingId(created.id);
            }}
            saving={createApi.isPending}
          />
        )}

        {sortedApis.map((api) => (
          <ApiCard
            key={api.id}
            api={api}
            isEditing={editingId === api.id}
            isConfirmingDelete={confirmDeleteId === api.id}
            credentials={credentials ?? []}
            onEdit={() => setEditingId(editingId === api.id ? null : api.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={async (dto) => {
              await updateApi.mutateAsync({ id: api.id, dto });
              setEditingId(null);
            }}
            saving={updateApi.isPending}
            onToggleEnabled={async () => {
              await updateApi.mutateAsync({ id: api.id, dto: { enabled: !api.enabled } });
            }}
            toggling={updateApi.isPending}
            onDelete={() => setConfirmDeleteId(api.id)}
            onConfirmDelete={async () => {
              await removeApi.mutateAsync(api.id);
              setConfirmDeleteId(null);
              if (editingId === api.id) setEditingId(null);
            }}
            onCancelDelete={() => setConfirmDeleteId(null)}
            deleting={removeApi.isPending}
          />
        ))}

        {!isLoading && sortedApis.length === 0 && !showCreate && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
            <p className="text-sm">{t('managedApis.empty')}</p>
            <SecondaryButton onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {t('managedApis.newApi')}
            </SecondaryButton>
          </div>
        )}
      </div>
    </ContentShell>
  );
}

interface ApiCardProps {
  api: ManagedApi;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  credentials: Array<{ id: number; label: string }>;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (dto: UpdateManagedApiDto) => Promise<void>;
  saving: boolean;
  onToggleEnabled: () => Promise<void>;
  toggling: boolean;
  onDelete: () => void;
  onConfirmDelete: () => Promise<void>;
  onCancelDelete: () => void;
  deleting: boolean;
}

function ApiCard({
  api, isEditing, isConfirmingDelete, credentials,
  onEdit, onCancelEdit, onSave, saving,
  onToggleEnabled, toggling,
  onDelete, onConfirmDelete, onCancelDelete, deleting,
}: ApiCardProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-border bg-panel-background overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={onEdit}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isEditing ? 'rotate-180' : ''}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{api.name}</span>
              {!api.enabled && (
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {t('common.disabled')}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">{api.baseUrl}</p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <ToggleSwitch
            checked={api.enabled}
            onChange={onToggleEnabled}
            disabled={toggling}
            labelOn={t('managedApis.disable')}
            labelOff={t('managedApis.enable')}
          />
          <button
            onClick={onEdit}
            className="btn-icon"
            title={t('managedApis.editConnection')}
          >
            <Pencil className="h-4 w-4" />
          </button>
          {isConfirmingDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onConfirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/20"
              >
                {deleting && <Loader2 className="h-3 w-3 animate-spin" />}
                {t('common.confirm')}
              </button>
              <button onClick={onCancelDelete} className="btn-icon" title={t('common.cancel')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button onClick={onDelete} className="btn-icon hover:text-destructive" title={t('common.delete')}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded editor */}
      {isEditing && (
        <div className="border-t border-border">
          <ApiEditor
            mode="edit"
            api={api}
            credentials={credentials}
            onCancel={onCancelEdit}
            onSave={onSave}
            saving={saving}
          />
        </div>
      )}
    </div>
  );
}

interface ApiEditorProps {
  mode: 'create' | 'edit';
  api?: ManagedApi;
  credentials: Array<{ id: number; label: string }>;
  onCancel: () => void;
  onSave: (dto: CreateManagedApiDto | UpdateManagedApiDto) => Promise<void>;
  saving: boolean;
}

function ApiEditor({ mode, api, credentials, onCancel, onSave, saving }: ApiEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(api?.name ?? '');
  const [description, setDescription] = useState(api?.description ?? '');
  const [baseUrl, setBaseUrl] = useState(api?.baseUrl ?? '');
  const [headerPattern, setHeaderPattern] = useState(api?.headerPattern ?? 'Authorization: {key}');
  const [credentialId, setCredentialId] = useState(api?.credentialId ? String(api.credentialId) : '');
  const [enabled, setEnabled] = useState(api?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError(t('managedApis.nameRequired')); return; }
    if (!baseUrl.trim()) { setError(t('managedApis.baseUrlRequired')); return; }
    if (!headerPattern.includes('{key}')) { setError(t('managedApis.headerPatternHint')); return; }

    const dto = mode === 'create'
      ? {
          name: name.trim(),
          description: description.trim() || undefined,
          baseUrl: baseUrl.trim(),
          credentialId: credentialId ? Number(credentialId) : null,
          headerPattern: headerPattern.trim(),
          enabled,
        } as CreateManagedApiDto
      : {
          name: name.trim(),
          description: description.trim() || undefined,
          baseUrl: baseUrl.trim(),
          credentialId: credentialId ? Number(credentialId) : null,
          headerPattern: headerPattern.trim(),
        } as UpdateManagedApiDto;

    try {
      await onSave(dto);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-2 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('managedApis.name')}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus placeholder="my-api" />
        </Field>
        <Field label={t('managedApis.descriptionField')}>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="GitHub REST API..." />
        </Field>
      </div>
      <Field label={t('managedApis.baseUrl')}>
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={inputCls} placeholder="https://api.example.com/v1" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('managedApis.headerPattern')}>
          <input value={headerPattern} onChange={(e) => setHeaderPattern(e.target.value)} className={inputCls} placeholder="Authorization: {key}" />
        </Field>
        <Field label={t('managedApis.credential')}>
          <select value={credentialId} onChange={(e) => setCredentialId(e.target.value)} className={inputCls}>
            <option value="">{t('managedApis.noCredential')}</option>
            {credentials.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-between pt-1">
        {mode === 'create' ? (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-primary" />
            <span className="text-xs text-muted-foreground">{t('managedApis.enabledHint')}</span>
          </label>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <SecondaryButton type="button" onClick={onCancel}>{t('common.cancel')}</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('common.save')}
          </PrimaryButton>
        </div>
      </div>
    </form>
  );
}
