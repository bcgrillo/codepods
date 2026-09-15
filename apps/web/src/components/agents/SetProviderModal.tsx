import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, Cpu } from 'lucide-react';
import { cx } from '../../utils/cx';
import { useExecuteAgentCommand } from '../../hooks/useAgents';
import { useAiProviders } from '../../hooks/useAiProviders';
import type { Agent } from '@codepods/shared-types';

interface SetProviderModalProps {
  agent: Agent;
  open: boolean;
  onClose: () => void;
}

export function SetProviderModal({ agent, open, onClose }: SetProviderModalProps) {
  const { t } = useTranslation();
  const executeCommand = useExecuteAgentCommand();
  const { data: providers } = useAiProviders();

  const existing = agent.commandMeta?.set_provider ?? null;
  const hasStartAgent =
    agent.templateCommands?.some((c) => c.type === 'start_agent') ?? false;
  const hasStopAgent =
    agent.templateCommands?.some((c) => c.type === 'stop_agent') ?? false;
  const [selectedProviderSlug, setSelectedProviderSlug] = React.useState(
    existing?.providerSlug ?? 'default',
  );
  const [selectedModelName, setSelectedModelName] = React.useState(
    existing?.modelName ?? 'default',
  );
  const [successMessage, setSuccessMessage] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [commandOutput, setCommandOutput] = React.useState<string | null>(null);
  const [restartAfterSet, setRestartAfterSet] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSelectedProviderSlug(existing?.providerSlug ?? 'default');
      setSelectedModelName(existing?.modelName ?? 'default');
      setSuccessMessage(false);
      setErrorMessage(null);
      setCommandOutput(null);
      setRestartAfterSet(false);
    }
  }, [open, existing?.providerSlug, existing?.modelName]);

  // Reset model to "default" when provider changes
  React.useEffect(() => {
    setSelectedModelName('default');
  }, [selectedProviderSlug]);

  if (!open) return null;

  const sortedProviders = React.useMemo(() => {
    if (!providers) return [];
    return [...providers]
      .filter((p) => p.enabled)
      .sort(
        (a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name),
      );
  }, [providers]);

  const selectedProvider = sortedProviders.find((p) => p.slug === selectedProviderSlug) ?? null;
  const selectedProviderModels = selectedProvider?.models ?? [];

  const handleExecute = async () => {
    setErrorMessage(null);
    setCommandOutput(null);
    try {
      // If restart is checked: set_provider → stop_agent → start_agent
      // If not checked: just set_provider
      const result = await executeCommand.mutateAsync({
        id: agent.id,
        dto: {
          type: 'set_provider',
          providerSlug: selectedProviderSlug,
          modelName: selectedModelName,
        },
      });
      if (result.commandOutput) {
        setCommandOutput(result.commandOutput);
      }

      if (restartAfterSet) {
        if (hasStopAgent) {
          await executeCommand.mutateAsync({ id: agent.id, dto: { type: 'stop_agent' } });
        }
        if (hasStartAgent) {
          await executeCommand.mutateAsync({ id: agent.id, dto: { type: 'start_agent' } });
        }
      }
      setSuccessMessage(true);
      setTimeout(() => {
        setSuccessMessage(false);
        onClose();
      }, 2500);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : t('agents.commandFailed'));
    }
  };

  const isExecuting = executeCommand.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">{t('agents.setProvider')}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-muted-foreground">{t('agents.setProviderPrompt')}</p>

          {/* Current configuration */}
          {existing && (
            <div className="rounded border border-border bg-secondary-item/40 p-3 space-y-1.5">
              <p className="text-xs font-medium text-emerald-400">{t('agents.providerConfigured')}</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">{t('agents.providerName')}</span>
                <span className="text-foreground font-mono">{existing.providerName}</span>
                <span className="text-muted-foreground">{t('agents.providerType')}</span>
                <span className="text-foreground font-mono">{existing.providerType}</span>
                <span className="text-muted-foreground">{t('agents.baseUrl')}</span>
                <span className="text-foreground font-mono truncate">{existing.baseUrl}</span>
                <span className="text-muted-foreground">{t('agents.modelName')}</span>
                <span className="text-foreground font-mono">{existing.modelName}</span>
                <span className="text-muted-foreground">{t('agents.configuredAt')}</span>
                <span className="text-foreground font-mono">
                  {new Date(existing.executedAt).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Provider + Model dropdowns on a single line */}
          <div className="flex items-center gap-2">
            <select
              value={selectedProviderSlug}
              onChange={(e) => setSelectedProviderSlug(e.target.value)}
              className="flex-1 rounded border border-border bg-secondary-item px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="default">{t('agents.defaultProvider')}</option>
              {sortedProviders.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={selectedModelName}
              onChange={(e) => setSelectedModelName(e.target.value)}
              className="flex-1 rounded border border-border bg-secondary-item px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="default">{t('agents.defaultModel')}</option>
              {selectedProviderModels.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.displayName ?? m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Restart checkbox */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={restartAfterSet}
              onChange={(e) => setRestartAfterSet(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-secondary-item"
            />
            {t('agents.setProviderRestart')}
            <span className="text-amber-500/80">⚠ {t('agents.setProviderRestartWarning')}</span>
          </label>

          {/* Success / error */}
          {successMessage && (
            <p className="text-xs text-emerald-400">{t('agents.commandExecuted')}</p>
          )}
          {errorMessage && <p className="text-xs text-red-400">{errorMessage}</p>}
          {commandOutput && (
            <div className="rounded bg-background p-2 font-mono text-[11px] text-foreground max-h-32 overflow-auto">
              {commandOutput.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
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
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className={cx(
              'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
            )}
            >
              {isExecuting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('agents.execute')}
            </button>
        </div>
      </div>
    </div>
  );
}