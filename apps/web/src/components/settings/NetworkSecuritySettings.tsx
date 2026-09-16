import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, X, Clock, GlobeLock } from 'lucide-react';
import { useConfig, useUpdateConfig, useReloadConfig, useTempExceptions, useCreateTempException, useRevokeTempException } from '../../hooks/useConfig';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { SectionHeader } from '../ui/SectionHeader';
import { FormContainer } from '../ui/FormContainer';
import { SettingsToolbar } from '../ui/SettingsToolbar';
import { inputCompactCls } from '../ui/styles';
import type { NetworkSecurityConfig } from '@codepods/shared-types';

export function NetworkSecuritySettingsSection() {
  const { t } = useTranslation();
  const { data: config, isLoading } = useConfig();
  const updateConfig = useUpdateConfig();
  const reloadConfig = useReloadConfig();

  const [netEdit, setNetEdit] = useState<Partial<NetworkSecurityConfig>>({});
  const [whitelistDraft, setWhitelistDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);

  const dirty = Object.keys(netEdit).length > 0 || whitelistDraft !== null;
  useUnsavedChangesGuard(dirty);

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const net: NetworkSecurityConfig = { ...config.networkSecurity, ...netEdit };
  const handleSave = () => {
    const merged: NetworkSecurityConfig = { ...config.networkSecurity, ...netEdit };
    if (whitelistDraft !== null) {
      merged.egressWhitelist = whitelistDraft.split('\n').map((s) => s.trim()).filter(Boolean);
    }
    if (Object.keys(netEdit).length === 0 && whitelistDraft === null) return;
    updateConfig.mutate({ networkSecurity: merged }, {
      onSuccess: () => {
        setNetEdit({});
        setWhitelistDraft(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  };

  const setNet = <K extends keyof NetworkSecurityConfig>(key: K, value: NetworkSecurityConfig[K]) =>
    setNetEdit({ ...netEdit, [key]: value });

  return (
    <SettingsToolbar
      title={t('settings.networkSecurity')}
      icon={GlobeLock}
      dirty={dirty}
      saved={saved}
      saving={updateConfig.isPending}
      reloadPending={reloadConfig.isPending}
      onSave={handleSave}
      onReload={() => {
        setNetEdit({});
        setWhitelistDraft(null);
        setSaved(false);
        reloadConfig.mutate();
      }}
      saveLabel={t('common.save')}
      savedLabel={t('settings.saved')}
      reloadLabel={t('settings.reload')}
      reloadDirtyConfirm={t('settings.unsavedRefreshWarning')}
    >
      <FormContainer className="space-y-4 py-4">
        <p className="text-xs text-muted-foreground -mt-1">{t('settings.networkSecurityHint')}</p>

        {/* --- Egress filtering --- */}
        <section className="space-y-1.5 pt-3 border-t border-border">
          <SectionHeader title={t('settings.networkEgressFiltering')} />
          <div className="flex items-start justify-between py-1.5 gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-foreground">{t('settings.networkFilterEgress')}</span>
                <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary-item text-muted-foreground border border-border whitespace-nowrap">
                  internet whitelist
                </code>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t('settings.networkFilterEgressHint')}</p>
            </div>
            <div className="flex-shrink-0 pt-0.5">
              <ToggleSwitch checked={net.filterInternetEgress} onChange={() => setNet('filterInternetEgress', !net.filterInternetEgress)} />
            </div>
          </div>
          <div className="flex items-end justify-between gap-3 py-1.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-foreground">{t('settings.networkProxyPort')}</span>
                <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary-item text-muted-foreground border border-border whitespace-nowrap">
                  proxy listen port
                </code>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t('settings.networkProxyPortHint')}</p>
            </div>
            <input
              className={`${inputCompactCls} w-24 flex-shrink-0`}
              value={String(net.proxyPort)}
              onChange={(e) => setNet('proxyPort', Number(e.target.value) || 0)}
            />
          </div>
        </section>

        {/* --- Egress whitelist --- */}
        <section className="space-y-2 pt-3 border-t border-border">
          <SectionHeader title={t('settings.networkWhitelistTitle')} />
          <p className="text-xs text-muted-foreground">{t('settings.networkWhitelistHint')}</p>
          {!warningDismissed && (
            <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-500/80">
              <p className="flex-1">{t('settings.networkWhitelistWarning')}</p>
              <button
                className="flex-shrink-0 p-0.5 rounded text-amber-600/50 hover:text-amber-500 hover:bg-muted transition-colors"
                onClick={() => setWarningDismissed(true)}
                title={t('common.dismiss')}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <textarea
            className="w-full px-3 py-2 text-sm rounded bg-background border border-input text-foreground focus:outline-none focus:border-primary transition-colors min-h-[160px] font-mono"
            value={whitelistDraft !== null ? whitelistDraft : net.egressWhitelist.join('\n')}
            onChange={(e) => setWhitelistDraft(e.target.value)}
            onBlur={() => {
              if (whitelistDraft !== null) {
                setNet('egressWhitelist', whitelistDraft.split('\n').map((s) => s.trim()).filter(Boolean));
              }
            }}
            placeholder={t('settings.networkWhitelistPlaceholder')}
          />
        </section>

        {/* --- Temporary exceptions --- */}
        <TempExceptionsSection />
      </FormContainer>
    </SettingsToolbar>
  );
}

function TempExceptionsSection() {
  const { t } = useTranslation();
  const { data: exceptions, isLoading } = useTempExceptions();
  const createMutation = useCreateTempException();
  const revokeMutation = useRevokeTempException();

  const [host, setHost] = useState('');
  const [minutes, setMinutes] = useState('5');

  const handleAdd = () => {
    const h = host.trim();
    if (!h) return;
    const m = Number(minutes) || 5;
    createMutation.mutate({ host: h, durationMinutes: m }, { onSuccess: () => setHost('') });
  };

  const fmtExpiry = (iso: string) => {
    const remaining = new Date(iso).getTime() - Date.now();
    if (remaining <= 0) return t('settings.tempExpiryExpired');
    const mins = Math.floor(remaining / 60_000);
    const secs = Math.floor((remaining % 60_000) / 1000);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <section className="space-y-1.5 pt-3 border-t border-border">
      <SectionHeader title={t('settings.tempExceptionsTitle')} />
      <p className="text-xs text-muted-foreground">{t('settings.tempExceptionsHint')}</p>

      {/* Create form — compact inline */}
      <div className="flex items-center gap-1.5">
        <input
          className={`${inputCompactCls} flex-1 min-w-0`}
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('settings.tempExceptionHost')}
        />
        <input
          className={`${inputCompactCls} w-16 flex-shrink-0`}
          type="number"
          min={1}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          title={t('settings.tempExceptionMinutes')}
        />
        <button
          className="flex items-center gap-1 px-2 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex-shrink-0 disabled:opacity-50"
          onClick={handleAdd}
          disabled={!host.trim() || createMutation.isPending}
        >
          <Plus className="h-3 w-3" />
          {t('common.add')}
        </button>
      </div>

      {/* Active exceptions list — compact */}
      {isLoading ? (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        </div>
      ) : exceptions && exceptions.length > 0 ? (
        <div className="space-y-1">
          {exceptions.map((exc) => (
            <div
              key={exc.host}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-background border border-border text-xs"
            >
              <Clock className="h-3 w-3 text-amber-600 dark:text-amber-500/70 flex-shrink-0" />
              <code className="font-mono text-foreground flex-1 min-w-0 truncate">{exc.host}</code>
              <span className="text-muted-foreground flex-shrink-0">
                {exc.agentId === 'manual' ? t('settings.tempExceptionManual') : exc.agentId}
              </span>
              <span className="text-amber-600 dark:text-amber-500/70 flex-shrink-0">{fmtExpiry(exc.expiresAt)}</span>
              <button
                className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors flex-shrink-0"
                onClick={() => revokeMutation.mutate(exc.host)}
                disabled={revokeMutation.isPending}
                title={t('common.revoke')}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-1">{t('settings.tempExceptionsEmpty')}</p>
      )}
    </section>
  );
}