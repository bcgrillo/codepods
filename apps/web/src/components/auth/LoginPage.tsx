import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock, Eye, EyeOff, ShieldCheck, Terminal, SquareCode } from 'lucide-react';
import { useLogin, getAuthToken } from '../../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Standalone login page. Rendered at /login. If a valid token is already
 * present, redirects to the app root. When logging in from a new device, shows
 * the 6-char approval code that must be confirmed from the host terminal.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const login = useLogin();

  if (getAuthToken()) return <Navigate to="/agents" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await login(username.trim() || undefined, password);
      if (res.devicePending && res.code) {
        setPendingCode(res.code);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // New-device approval screen: show the code and how to approve it.
  if (pendingCode) {
    return (
      <div className="min-h-svh w-full flex items-center justify-center bg-page-background p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-panel-background p-6 shadow-sm">
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-secondary-item">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">{t('auth.deviceTitle')}</h1>
            <p className="text-sm text-muted-foreground text-center">{t('auth.deviceHint')}</p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="text-sm font-medium text-muted-foreground">{t('auth.deviceCodeLabel')}</div>
            <div className="flex items-center gap-2">
              {pendingCode.split('').map((digit, i) => (
                <div
                  key={i}
                  className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-secondary-item text-2xl font-mono font-bold tracking-widest text-foreground"
                >
                  {digit}
                </div>
              ))}
            </div>

            <div className="w-full border-t border-border my-2" />

            <div className="flex items-start gap-2 text-xs text-muted-foreground w-full">
              <Terminal className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
              <p>
                {t('auth.deviceCommandHint')}{' '}
                <code className="text-foreground">node apps/api/dist/cli.js approve {pendingCode}</code>
              </p>
            </div>

            <Button variant="outline" className="w-full" onClick={() => setPendingCode(null)}>
              <Lock className="h-4 w-4 mr-2" />
              {t('auth.deviceBackToLogin')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh w-full flex items-center justify-center bg-page-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-panel-background p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-secondary-item">
            <SquareCode className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">{t('auth.login')}</h1>
          <p className="text-sm text-muted-foreground text-center">{t('auth.loginHint')}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">{t('auth.username')}</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-foreground"
                title={show ? t('auth.hide') : t('auth.show')}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
            {t('auth.loginAction')}
          </Button>
        </form>
      </div>
    </div>
  );
}
