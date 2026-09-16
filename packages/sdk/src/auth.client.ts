import type {
  AuthLoginResult,
  AuthResetResult,
  DeviceDto,
  ChangePasswordResult,
} from '@codepods/shared-types';
import { notifyUnauthorized } from './auth';

export class AuthClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });
    if (!res.ok) {
      if (res.status === 401) notifyUnauthorized();
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  login(username: string | undefined, password: string): Promise<AuthLoginResult> {
    return this.request<AuthLoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  /** Clears the admin auth cookie on the server. */
  logout(): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>('/auth/logout', { method: 'POST' });
  }

  reset(): Promise<AuthResetResult> {
    return this.request<AuthResetResult>('/auth/reset', { method: 'POST' });
  }

  listDevices(): Promise<DeviceDto[]> {
    return this.request<DeviceDto[]>('/auth/devices');
  }

  revokeDevice(deviceId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/auth/devices/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    });
  }

  changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
    return this.request<ChangePasswordResult>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }
}
