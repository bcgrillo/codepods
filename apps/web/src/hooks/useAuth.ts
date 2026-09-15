import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthClient, setAuthToken, getAuthToken, setOnUnauthorized } from '@codepods/sdk';
import type { AuthLoginResult, DeviceDto } from '@codepods/shared-types';

export const authClient = new AuthClient('/api');

const TOKEN_KEY = 'codepods.admin.token';

export function loadAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function persistAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore storage errors */
  }
  setAuthToken(token);
}

/**
 * Restores any previously saved admin token into the SDK auth header holder so
 * API calls are authenticated. Call once on app boot. Also wires the global
 * 401 handler: when any API call returns 401 (expired/revoked token) we clear
 * the stored token and bounce to /login.
 */
export function bootstrapAuth(): void {
  setAuthToken(loadAuthToken());
  setOnUnauthorized(() => {
    persistAuthToken(null);
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  });
}

export function useLogin() {
  return useCallback(
    async (username: string | undefined, password: string): Promise<AuthLoginResult> => {
      const res = await authClient.login(username, password);
      if (res.token) {
        persistAuthToken(res.token);
      }
      return res;
    },
    [],
  );
}

export function useLogout() {
  return useCallback(async () => {
    try {
      // Clear the HttpOnly auth cookie so the proxy iframe stops authenticating.
      await authClient.logout();
    } catch {
      /* ignore — local state is cleared regardless */
    }
    persistAuthToken(null);
  }, []);
}

export { getAuthToken };

// --- Device & password management hooks ---

const DEVICES_QK = ['auth', 'devices'] as const;

export function useDevices() {
  return useQuery<DeviceDto[]>({
    queryKey: DEVICES_QK,
    queryFn: () => authClient.listDevices(),
  });
}

export function useRevokeDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) => authClient.revokeDevice(deviceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEVICES_QK }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authClient.changePassword(currentPassword, newPassword),
  });
}
