import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2, KeyRound, Pencil, X, Check } from 'lucide-react';
import {
  useCredentials,
  useCreateCredential,
  useUpdateCredential,
  useRemoveCredential,
} from '../../hooks/useCredentials';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import type { Credential, CredentialType } from '@codepods/shared-types';
import { SectionHeader } from '../ui/SectionHeader';
import { FormContainer } from '../ui/FormContainer';
import { inputCls, inputCompactCls } from '../ui/styles';
import { cx } from '../../utils/cx';
import { ContentShell } from '../ContentShell';
import { ContentHeaderAction } from '../ContentHeader';

type Draft = {
  label: string;
  type: CredentialType;
  host: string;
  username: string;
  secret: string;
};

const emptyDraft: Draft = { label: '', type: 'key', host: '', username: '', secret: '' };

export function CredentialsSettingsSection() {
  const { t } = useTranslation();
  const { data: list, isLoading } = useCredentials();
  const createMut = useCreateCredential();
  const updateMut = useUpdateCredential();
  const removeMut = useRemoveCredential();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  useUnsavedChangesGuard(draft !== null);

  const startCreate = () => { setEditingId(null); setDraft({ ...emptyDraft }); };
  const startEdit = (c: Credential) => {
    setEditingId(c.id);
    setDraft({ label: c.label, type: c.type, host: c.host ?? '', username: c.username ?? '', secret: '' });
  };
  const cancel = () => { setDraft(null); setEditingId(null); };

  const submit = async () => {
    if (!draft || !draft.label.trim()) return;
    const payload = {
      label: draft.label.trim(),
      type: draft.type,
      host: draft.host.trim() || null,
      username: draft.type === 'user_pass' ? (draft.username.trim() || null) : null,
      secret: draft.secret.length > 0 ? draft.secret : null,
    };
    if (editingId !== null) {
      await updateMut.mutateAsync({ id: editingId, dto: payload });
    } else {
      await createMut.mutateAsync({ ...payload, secret: payload.secret ?? '' });
    }
    cancel();
  };

  const doRemove = async (id: number) => {
    await removeMut.mutateAsync(id);
    setConfirmRemoveId(null);
  };

  return (
    <ContentShell
      title={t('settings.credentials')}
      icon={KeyRound}
      subtitle={t('settings.credentialsHint')}
      actions={
        !draft
          ? [
              <ContentHeaderAction
                key="add"
                icon={Plus}
                label={t('settings.credentialsAdd')}
                onClick={startCreate}
                className="text-primary hover:text-primary-soft"
              />,
            ]
          : undefined
      }
    >
      <FormContainer className="space-y-4 py-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">{t('common.loading')}</span>
          </div>
        )}

        {/* List */}
        {!isLoading && list && list.length === 0 && !draft && (
          <p className="text-sm text-muted-foreground">{t('settings.credentialsEmpty')}</p>
        )}

        <div className="space-y-2">
          {list?.map((c) =>
            draft && editingId === c.id ? null : (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-secondary-item/50 px-3 py-2"
              >
                <KeyRound className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground truncate">{c.label}</span>
                    <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-secondary-item text-muted-foreground">
                      {c.type === 'user_pass' ? t('settings.credentialsTypeUserPass') : t('settings.credentialsTypeKey')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {c.host && <span className="truncate">{c.host}</span>}
                    {c.username && <span className="truncate">@{c.username}</span>}
                    <span className={c.hasSecret ? 'text-emerald-600 dark:text-emerald-500/70' : 'text-amber-600 dark:text-amber-500/70'}>
                      {c.hasSecret ? t('settings.credentialsSecretKeep') : t('settings.credentialsSecretEmpty')}
                    </span>
                  </div>
                </div>
                {confirmRemoveId === c.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => doRemove(c.id)}
                      className="p-1.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      title={t('settings.credentialsRemove')}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmRemoveId(null)}
                      className="p-1.5 rounded bg-secondary-item text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(c)}
                      className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-secondary-item transition-colors"
                      title={t('settings.credentialsEdit')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmRemoveId(c.id)}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-secondary-item transition-colors"
                      title={t('settings.credentialsRemove')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ),
          )}
        </div>

        {/* Create / edit form */}
        {draft && (
          <CredentialForm
            draft={draft}
            onChange={setDraft}
            editing={editingId !== null}
            saving={createMut.isPending || updateMut.isPending}
            onSubmit={submit}
            onCancel={cancel}
          />
        )}
      </FormContainer>
    </ContentShell>
  );
}

function CredentialForm({
  draft,
  onChange,
  editing,
  saving,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  editing: boolean;
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary-item/50 p-3">
      <SectionHeader
        title={editing ? t('settings.credentialsEdit') : t('settings.credentialsAdd')}
        icon={<KeyRound className="w-4 h-4 text-muted-foreground" />}
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t('settings.credentialsLabel')}</span>
          <input
            className={inputCls}
            value={draft.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="GitHub PAT"
            autoFocus
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t('settings.credentialsType')}</span>
          <select
            className={inputCls}
            value={draft.type}
            onChange={(e) => set({ type: e.target.value as CredentialType, username: '' })}
          >
            <option value="key">{t('settings.credentialsTypeKey')}</option>
            <option value="user_pass">{t('settings.credentialsTypeUserPass')}</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t('settings.credentialsHost')}</span>
          <input
            className={inputCls}
            value={draft.host}
            onChange={(e) => set({ host: e.target.value })}
            placeholder="github.com"
          />
          <span className="text-[11px] text-muted-foreground/70">{t('settings.credentialsHostHint')}</span>
        </label>
        {draft.type === 'user_pass' && (
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">{t('settings.credentialsUsername')}</span>
            <input
              className={inputCls}
              value={draft.username}
              onChange={(e) => set({ username: e.target.value })}
              placeholder="bob"
            />
          </label>
        )}
      </div>

      <label className="space-y-1">
        <span className="text-xs text-muted-foreground">{t('settings.credentialsSecret')}</span>
        <input
          type="password"
          className={cx(inputCls, 'font-mono')}
          value={draft.secret}
          onChange={(e) => set({ secret: e.target.value })}
          placeholder={editing ? t('settings.credentialsSecretHint') : 'ghp_… / password'}
        />
        {editing && (
          <span className="text-[11px] text-muted-foreground/70">{t('settings.credentialsSecretHint')}</span>
        )}
      </label>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className={cx(inputCompactCls, 'px-3 text-muted-foreground hover:bg-secondary-item')}
        >
          {t('settings.credentialsCancel')}
        </button>
        <button
          onClick={onSubmit}
          disabled={saving || !draft.label.trim()}
          className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {editing ? t('settings.credentialsSaveUpdate') : t('settings.credentialsSaveCreate')}
        </button>
      </div>
    </div>
  );
}