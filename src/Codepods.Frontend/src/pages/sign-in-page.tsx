import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { useSession } from "@/auth/session-context";
import { getOrCreateDeviceId } from "@/lib/auth-storage";
import { ApiError } from "@/lib/api";

export function SignInPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deviceId, setDeviceId] = useState(session.defaultDeviceId);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!deviceId || deviceId.trim().length === 0) {
      setDeviceId(getOrCreateDeviceId());
    }
  }, [deviceId]);

  if (!session.loading && session.isAuthenticated) {
    return <Navigate to="/agents" replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await session.signIn({ username, password, deviceId });
      navigate("/agents", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to sign in.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
      >
        <h1 className="text-2xl font-semibold tracking-tight">Sign In</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use your Codepods credentials and device id.
        </p>

        <div className="mt-5 space-y-4">
          <Field
            label="Username"
            value={username}
            onChange={setUsername}
            type="text"
            autoComplete="username"
          />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            rightIconButton={{
              label: showPassword ? "Hide password" : "Show password",
              onClick: () => setShowPassword((current) => !current),
              icon: showPassword ? <Eye size={16} /> : <EyeOff size={16} />,
            }}
          />
          <Field
            label="Device ID"
            value={deviceId}
            onChange={setDeviceId}
            type="text"
            readOnly
            helperText="Auto-generated and persisted for this browser."
          />
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: string;
  autoComplete?: string;
  readOnly?: boolean;
  helperText?: string;
  rightIconButton?: {
    label: string;
    onClick: () => void;
    icon: ReactNode;
  };
};

function Field(props: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
        {props.label}
      </span>
      <div className="relative">
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          type={props.type}
          autoComplete={props.autoComplete}
          readOnly={props.readOnly}
          className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-ring ${
            props.rightIconButton ? "pe-10" : ""
          } ${props.readOnly ? "text-muted-foreground" : "text-foreground"}`}
        />
        {props.rightIconButton ? (
          <button
            type="button"
            aria-label={props.rightIconButton.label}
            onClick={props.rightIconButton.onClick}
            className="absolute inset-y-0 end-2 flex items-center text-muted-foreground hover:text-foreground"
          >
            {props.rightIconButton.icon}
          </button>
        ) : null}
      </div>
      {props.helperText ? (
        <span className="mt-1 block text-xs text-muted-foreground">{props.helperText}</span>
      ) : null}
    </label>
  );
}
