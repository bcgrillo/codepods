import { Controller, Post, Get, Delete, Body, Param, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import { DeviceService } from './device.service';
import { LoginDto } from './dto/login.dto';
import type { DeviceDto, ChangePasswordResult } from '@codepods/shared-types';

/** Express Request augmented by AuthGuard (sets req.user = UserEntity). */
type AuthedRequest = Request & { user?: { id: number } };

export const AUTH_COOKIE = 'codepods_token';
export const DEVICE_COOKIE = 'codepods_device';

/**
 * Sets the admin auth cookie on the response. The cookie is HttpOnly so it is
 * not readable from JS, but it IS sent automatically on same-origin requests
 * (e.g. the agent-service proxy iframe, which cannot attach a Bearer header).
 */
export function setAuthCookie(res: Response, token: string | null): void {
  const value = token ? encodeURIComponent(token) : '';
  const maxAge = token ? 30 * 24 * 60 * 60 : 0; // seconds
  // Use append (not setHeader) so we don't clobber other Set-Cookie headers
  // (e.g. a session cookie set by host middleware).
  res.append(
    'Set-Cookie',
    `${AUTH_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
  );
}

/**
 * Sets the device cookie that identifies this browser/agent. Long-lived so the
 * device is remembered across sessions. HttpOnly, not readable from JS.
 */
export function setDeviceCookie(res: Response, deviceId: string): void {
  const value = encodeURIComponent(deviceId);
  res.append(
    'Set-Cookie',
    `${DEVICE_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${365 * 24 * 60 * 60}`,
  );
}

/** Extracts a cookie value by name from a request, if present. */
export function getCookieValue(
  request: { headers: Record<string, string | string[] | undefined> },
  name: string,
): string | null {
  const header = request.headers.cookie;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly deviceService: DeviceService,
  ) {}

  @Public()
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceId = getCookieValue(req, DEVICE_COOKIE);
    const deviceName = req.headers['user-agent'] || '';
    const result = await this.authService.login(
      body.username,
      body.password,
      deviceId ?? undefined,
      deviceName,
    );
    if (result.deviceId) {
      setDeviceCookie(res, result.deviceId);
    }
    if (result.token) {
      setAuthCookie(res, result.token);
    }
    return result;
  }

  /** Clears the admin auth cookie. Requires a valid session. */
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    setAuthCookie(res, null);
    return { ok: true };
  }

  /** Requires admin auth (not public). Resets the admin password. */
  @Post('reset')
  reset() {
    return this.authService.reset();
  }

  /** Lists all devices for the current user. */
  @Get('devices')
  async listDevices(@Req() req: AuthedRequest): Promise<DeviceDto[]> {
    const user = req.user!;
    const currentDeviceId = getCookieValue(req, DEVICE_COOKIE);
    const devices = await this.deviceService.listByUser(user.id);
    return devices.map((d) => ({
      id: d.id,
      deviceId: d.deviceId,
      name: d.name,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      lastAttemptAt: d.lastAttemptAt?.toISOString() ?? null,
      lastLoginAt: d.lastLoginAt?.toISOString() ?? null,
      isCurrent: d.deviceId === currentDeviceId,
    }));
  }

  /** Revokes a device for the current user. */
  @Delete('devices/:deviceId')
  async revokeDevice(
    @Param('deviceId') deviceId: string,
    @Req() req: AuthedRequest,
  ): Promise<{ ok: boolean }> {
    const user = req.user!;
    const ok = await this.deviceService.revokeForUser(user.id, deviceId);
    return { ok };
  }

  /** Changes the admin password (requires current password). */
  @Post('change-password')
  async changePassword(
    @Body() body: { currentPassword: string; newPassword: string },
    @Req() req: AuthedRequest,
  ): Promise<ChangePasswordResult> {
    const user = req.user!;
    await this.authService.changePassword(user.id, body.currentPassword, body.newPassword);
    return { ok: true };
  }
}
