import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  apiRequest,
  type LoginResponse,
  type MeResponse,
} from "@/lib/api";
import {
  clearAccessToken,
  getAccessToken,
  getOrCreateDeviceId,
  setAccessToken,
  setDeviceId,
} from "@/lib/auth-storage";

type SignInInput = {
  username: string;
  password: string;
  deviceId: string;
};

type SessionContextValue = {
  loading: boolean;
  isAuthenticated: boolean;
  me: MeResponse | null;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => void;
  refreshSession: () => Promise<void>;
  defaultDeviceId: string;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [defaultDeviceId] = useState(() => getOrCreateDeviceId());

  const resetSession = useCallback(() => {
    clearAccessToken();
    setMe(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setMe(null);
      return;
    }

    try {
      const current = await apiRequest<MeResponse>("/api/auth/me");
      setMe(current);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        resetSession();
        return;
      }
      throw error;
    }
  }, [resetSession]);

  const signIn = useCallback(
    async (input: SignInInput) => {
      const login = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        auth: false,
        body: {
          username: input.username,
          password: input.password,
          device_id: input.deviceId,
        },
      });

      setAccessToken(login.access_token);
      setDeviceId(input.deviceId);
      await refreshSession();
    },
    [refreshSession],
  );

  const signOut = useCallback(() => {
    resetSession();
  }, [resetSession]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await refreshSession();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshSession]);

  const value = useMemo<SessionContextValue>(
    () => ({
      loading,
      isAuthenticated: me !== null,
      me,
      signIn,
      signOut,
      refreshSession,
      defaultDeviceId,
    }),
    [loading, me, signIn, signOut, refreshSession, defaultDeviceId],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return ctx;
}
