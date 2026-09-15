import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Trash2, Loader2, Eye } from 'lucide-react';
import { cx } from '../../utils/cx';
import { useUpdateAgentEnvVars, useRestartAgent, useAgentContainerEnvVars } from '../../hooks/useAgents';
import type { Agent } from '@codepods/shared-types';

interface AgentEnvVarsModalProps {
  agent: Agent;
  open: boolean;
  onClose: () => void;
}

interface EnvVarRow {
  key: string;
  value: string;
}

export function AgentEnvVarsModal({ agent, open, onClose }: AgentEnvVarsModalProps) {
  const { t } = useTranslation();
  const updateEnvVars = useUpdateAgentEnvVars();
  const restartAgent = useRestartAgent();
  const { data: containerEnv, isLoading: containerEnvLoading } = useAgentContainerEnvVars(open ? agent.id : null);

  const [rows, setRows] = React.useState<EnvVarRow[]>([]);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [savedMessage, setSavedMessage] = React.useState(false);
  const [showAllEnv, setShowAllEnv] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      const initial = agent.envVars
        ? Object.entries(agent.envVars).map(([key, value]) => ({ key, value }))
        : [];
      setRows(initial.length > 0 ? initial : [{ key: '', value: '' }]);
      setShowConfirm(false);
      setSavedMessage(false);
      setShowAllEnv(false);
    }
  }, [open, agent.envVars]);

  if (!open) return null;

  const updateRow = (index: number, field: 'key' | 'value', val: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: val } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { key: '', value: '' }]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const buildEnvVars = (): Record<string, string> => {
    const envVars: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (key) {
        envVars[key] = row.value;
      }
    }
    return envVars;
  };

  const handleSave = async () => {
    const envVars = buildEnvVars();
    await updateEnvVars.mutateAsync({ id: agent.id, envVars });

    if (agent.status === 'running') {
      setShowConfirm(true);
    } else {
      setSavedMessage(true);
      setTimeout(() => {
        setSavedMessage(false);
        onClose();
      }, 2000);
    }
  };

  const handleRestartNow = async () => {
    setShowConfirm(false);
    await restartAgent.mutateAsync(agent.id);
    onClose();
  };

  const handleRestartLater = () => {
    setShowConfirm(false);
    setSavedMessage(true);
    setTimeout(() => {
      setSavedMessage(false);
      onClose();
    }, 2500);
  };

  const isSaving = updateEnvVars.isPending;
  const isRestarting = restartAgent.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">{t('agents.envVarsTitle')}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-muted-foreground">{t('agents.envVarsDescription')}</p>

          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">{t('agents.envVarsEmpty')}</p>
          )}

          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                placeholder={t('agents.envVarsKey')}
                value={row.key}
                onChange={(e) => updateRow(i, 'key', e.target.value)}
                className="flex-1 rounded bg-secondary-item border border-border px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
              />
              <span className="text-muted-foreground text-xs">=</span>
              <input
                type="text"
                placeholder={t('agents.envVarsValue')}
                value={row.value}
                onChange={(e) => updateRow(i, 'value', e.target.value)}
                className="flex-1 rounded bg-secondary-item border border-border px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
              />
              <button
                onClick={() => removeRow(i)}
                className="text-muted-foreground hover:text-red-400 transition-colors p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <button
            onClick={addRow}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-soft transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('agents.envVarsAdd')}
          </button>

          {/* All container env vars (read-only) */}
          <div className="pt-2 border-t border-border/50">
            <button
              onClick={() => setShowAllEnv((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              {showAllEnv ? t('agents.envVarsHideAll') : t('agents.envVarsShowAll')}
            </button>
            {showAllEnv && (
              <div className="mt-2 max-h-48 overflow-auto rounded bg-background p-2 font-mono text-[11px]">
                {containerEnvLoading && (
                  <p className="text-muted-foreground py-2">{t('common.loading')}</p>
                )}
                {!containerEnvLoading && containerEnv && Object.keys(containerEnv).length > 0 && (
                  <div className="space-y-0.5">
                    {Object.entries(containerEnv)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([key, value]) => {
                        const isSetByUs = agent.envVars && key in agent.envVars;
                        return (
                          <div key={key} className="flex gap-2">
                            <span className={cx('flex-shrink-0', isSetByUs ? 'text-primary' : 'text-muted-foreground')}>
                              {key}
                            </span>
                            <span className="text-muted-foreground">=</span>
                            <span className={cx('truncate', isSetByUs ? 'text-foreground' : 'text-muted-foreground')}>
                              {value}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
                {!containerEnvLoading && containerEnv && Object.keys(containerEnv).length === 0 && (
                  <p className="text-muted-foreground py-2">{t('agents.envVarsContainerNotRunning')}</p>
                )}
              </div>
            )}
          </div>

          {/* Confirm restart */}
          {showConfirm && (
            <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-3 space-y-2">
              <p className="text-xs text-yellow-400">{t('agents.envVarsRestartMessage')}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRestartNow}
                  disabled={isRestarting}
                  className="inline-flex items-center gap-1.5 rounded bg-yellow-500/20 px-3 py-1.5 text-xs font-medium text-yellow-400 hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
                >
                  {isRestarting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {t('agents.envVarsRestartYes')}
                </button>
                <button
                  onClick={handleRestartLater}
                  disabled={isRestarting}
                  className="rounded bg-secondary-item px-3 py-1.5 text-xs text-foreground hover:bg-secondary-item transition-colors disabled:opacity-50"
                >
                  {t('agents.envVarsRestartLater')}
                </button>
              </div>
            </div>
          )}

          {/* Saved message */}
          {savedMessage && (
            <p className="text-xs text-emerald-400">{t('agents.envVarsSaved')}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-foreground hover:bg-secondary-item transition-colors"
          >
            {t('common.cancel')}
          </button>
          {!showConfirm && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={cx(
                'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
              )}
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('agents.envVarsSave')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}