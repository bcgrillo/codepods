import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Monitor,
  Smartphone,
  Globe,
  LogOut,
  Loader2,
  Check,
  AlertCircle,
  ShieldAlert,
  KeyRound,
  Trash2,
} from 'lucide-react';
import { useLogout, useDevices, useRevokeDevice, useChangePassword } from '../../hooks/useAuth';
import { useUiStore } from '../../store/uiStore';
import { ContentShell } from '../ContentShell';
import { ContentHeaderAction } from '../ContentHeader';
import { FormContainer } from '../ui/FormContainer';
import { SectionHeader } from '../ui/SectionHeader';
import { TextField } from '../ui/TextField';
import { PrimaryButton } from '../ui/PrimaryButton';
import { cx } from '../../utils/cx';

function deviceIcon(name: string) {
  const ua = name.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return Smartphone;
  if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari')) return Globe;
  return Monitor;
}

const STATUS_STYLES: Record<string, string> = {
  validated: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  pending: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  revoked: 'bg-destructive/15 text-destructive border-destructive/30',
};

export function UserSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogout();
  const { userSection } = useUiStore();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const title =
    userSection === 'password' ? t('user.changePassword')
    : userSection === 'devices' ? t('user.devices')
    : t('nav.logout');

  const icon = userSection === 'password' ? KeyRound : userSection === 'devices' ? Monitor : LogOut;

  return (
    <ContentShell
      title={title}
      icon={icon}
      actions={
        userSection !== 'logout'
          ? [
              <ContentHeaderAction
                key="logout"
                icon={LogOut}
                label={t('nav.logout')}
                onClick={handleLogout}
                className="hover:text-destructive hover:bg-destructive/10"
              />,
            ]
          : []
      }
    >
      {userSection === 'password' && <PasswordSection />}
      {userSection === 'devices' && <DevicesSection />}
      {userSection === 'logout' && <LogoutSection onLogout={handleLogout} />}
    </ContentShell>
  );
}

function PasswordSection() {
  const { t } = useTranslation();
  const changePassword = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPassword.length < 8) {
      setPwMsg({ type: 'error', text: t('user.passwordTooShort') });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: t('user.passwordMismatch') });
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setPwMsg({ type: 'success', text: t('user.passwordChanged') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPwMsg({ type: 'error', text: err instanceof Error ? err.message : t('common.error') });
    }
  };

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <FormContainer className="space-y-4 py-6">
        <SectionHeader title={t('user.changePassword')} icon={<KeyRound className="h-4 w-4" />} />
        <TextField
          label={t('user.currentPassword')}
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          placeholder="••••••••"
        />
        <TextField
          label={t('user.newPassword')}
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          placeholder="••••••••"
        />
        <TextField
          label={t('user.confirmPassword')}
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="••••••••"
        />
        {pwMsg && (
          <div
            className={cx(
              'flex items-center gap-2 text-xs',
              pwMsg.type === 'error' ? 'text-destructive' : 'text-emerald-500',
            )}
          >
            {pwMsg.type === 'error' ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {pwMsg.text}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t('user.passwordHint')}</p>
        <PrimaryButton
          onClick={handleChangePassword}
          disabled={!currentPassword || !newPassword || !confirmPassword || changePassword.isPending}
        >
          {changePassword.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          {t('user.changePassword')}
        </PrimaryButton>
      </FormContainer>
    </div>
  );
}

function DevicesSection() {
  const { t } = useTranslation();
  const { data: devices, isLoading: devicesLoading } = useDevices();
  const revokeDevice = useRevokeDevice();
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const handleRevoke = async (deviceId: string) => {
    try {
      await revokeDevice.mutateAsync(deviceId);
      setConfirmRevokeId(null);
    } catch {
      /* error shown via mutation state */
    }
  };

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <FormContainer className="space-y-4 py-6">
        <SectionHeader title={t('user.devices')} icon={<Monitor className="h-4 w-4" />} />
        <p className="text-xs text-muted-foreground -mt-2">{t('user.devicesHint')}</p>

        {devicesLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !devices || devices.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 py-4 text-center">
            {t('user.noDevices')}
          </p>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => {
              const Icon = deviceIcon(device.name);
              const isCurrent = device.isCurrent;
              const isRevoked = device.status === 'revoked';
              const isConfirming = confirmRevokeId === device.deviceId;

              return (
                <div
                  key={device.deviceId}
                  className={cx(
                    'flex items-center gap-3 rounded-lg border px-4 py-3',
                    isCurrent ? 'border-primary/30 bg-primary/5' : 'border-border',
                  )}
                >
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {device.name || t('user.unknownDevice')}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary-soft border border-primary/30">
                          {t('user.currentDevice')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={cx(
                          'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border',
                          STATUS_STYLES[device.status],
                        )}
                      >
                        {t(`user.deviceStatus.${device.status}`)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('user.lastLogin')}: {device.lastLoginAt ? new Date(device.lastLoginAt).toLocaleString() : t('user.never')}
                      </span>
                    </div>
                  </div>

                  {!isRevoked && (
                    <div className="shrink-0">
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          {isCurrent && (
                            <span className="text-xs text-amber-500 flex items-center gap-1 mr-1">
                              <ShieldAlert className="h-3.5 w-3.5" />
                            </span>
                          )}
                          <button
                            onClick={() => handleRevoke(device.deviceId)}
                            disabled={revokeDevice.isPending}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive border border-destructive/30 hover:bg-destructive/10 transition-colors"
                            title={isCurrent ? t('user.revokeCurrentWarning') : t('user.revokeDevice')}
                          >
                            {revokeDevice.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            {t('common.confirm')}
                          </button>
                          <button
                            onClick={() => setConfirmRevokeId(null)}
                            className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRevokeId(device.deviceId)}
                          className="rounded p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                          title={isCurrent ? t('user.revokeCurrentWarning') : t('user.revokeDevice')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {isCurrentRevokeWarning(confirmRevokeId, devices) && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-500/80">
              {t('user.revokeCurrentWarning')}
            </p>
          </div>
        )}
      </FormContainer>
    </div>
  );
}

function LogoutSection({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <LogOut className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{t('nav.logout')}</h2>
        <p className="text-sm text-muted-foreground">{t('user.logoutHint')}</p>
        {confirming ? (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              <LogOut className="h-4 w-4" />
              {t('common.confirm')}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 rounded-md border border-destructive/30 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            {t('nav.logout')}
          </button>
        )}
      </div>
    </div>
  );
}

function isCurrentRevokeWarning(
  confirmId: string | null,
  devices: { deviceId: string; isCurrent?: boolean }[] | undefined,
): boolean {
  if (!confirmId || !devices) return false;
  const device = devices.find((d) => d.deviceId === confirmId);
  return !!device?.isCurrent;
}
