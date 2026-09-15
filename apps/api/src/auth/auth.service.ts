import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  AuthStatus,
  AuthSetupResult,
  AuthLoginResult,
  AuthResetResult,
} from '@codepods/shared-types';
import { UserEntity } from './user.entity';
import { DeviceService } from './device.service';
import { CryptoService } from '../secrets/crypto.service';

const ADMIN_USERNAME = 'admin';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly cryptoService: CryptoService,
    private readonly deviceService: DeviceService,
  ) {}

  /** Returns whether an admin user is configured. */
  async getStatus(): Promise<AuthStatus> {
    const count = await this.users.count();
    return { configured: count > 0 };
  }

  /**
   * First-run admin setup. Only works before any user exists.
   * If no password is provided a complex one is generated and returned once
   * (shown on screen by the caller). The plaintext password is never stored.
   */
  async setup(username?: string, password?: string): Promise<AuthSetupResult> {
    const count = await this.users.count();
    if (count > 0) {
      throw new ConflictException('Admin user already configured');
    }
    const generated = !password;
    const effectivePassword = password || generatePassword();
    const user = this.users.create({
      username: (username ?? ADMIN_USERNAME).trim().toLowerCase(),
      role: 'owner',
      passwordHash: hashPassword(effectivePassword),
    });
    await this.users.save(user);
    return {
      configured: true,
      password: generated ? effectivePassword : null,
      generated,
    };
  }

  /**
   * Verifies credentials and returns an admin bearer token — unless the request
   * comes from a new/pending device, in which case it returns a 6-char approval
   * code that must be confirmed from the host terminal (CLI approve) first.
   */
  async login(
    username: string | undefined,
    password: string,
    deviceId?: string,
    deviceName?: string,
  ): Promise<AuthLoginResult> {
    const name = (username ?? ADMIN_USERNAME).trim().toLowerCase();
    const user = await this.users.findOne({ where: { username: name } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Device validation: a known, validated device gets a token immediately.
    if (deviceId) {
      const device = await this.deviceService.findByDeviceId(user.id, deviceId);
      if (device?.status === 'validated') {
        await this.deviceService.updateLastLogin(user.id, device.deviceId);
        return {
          token: this.issueToken(user, device.deviceId),
          deviceId: device.deviceId,
        };
      }
      // Pending device: refresh its code so the user can approve it.
      if (device?.status === 'pending') {
        const code = await this.deviceService.refreshPendingCode(device);
        return { devicePending: true, deviceId: device.deviceId, code };
      }
    }

    // New (or revoked) device: create a pending entry and show the code.
    const newDeviceId = deviceId || crypto.randomBytes(24).toString('hex');
    const { device, code } = await this.deviceService.createPending(
      user.id,
      newDeviceId,
      deviceName || '',
    );
    return { devicePending: true, deviceId: device.deviceId, code };
  }

  /**
   * Changes the admin password. Requires the current password to be verified.
   * All existing tokens are invalidated because they are bound to the password hash.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (newPassword.length < 8) {
      throw new UnauthorizedException('New password must be at least 8 characters');
    }
    user.passwordHash = hashPassword(newPassword);
    await this.users.save(user);
  }

  /**
   * Resets the admin password. Requires authentication (the caller is already
   * an authenticated admin). A new complex password is generated and returned
   * once so it can be shown on screen.
   */
  async reset(): Promise<AuthResetResult> {
    const user = await this.users.findOne({ where: { username: ADMIN_USERNAME } });
    if (!user) {
      throw new UnauthorizedException('No admin user configured');
    }
    const password = generatePassword();
    user.passwordHash = hashPassword(password);
    await this.users.save(user);
    return { password, generated: true };
  }

  /**
   * Validates a bearer token and returns the user, or null when invalid.
   * The token is bound to a specific device: it is only valid while that
   * device is still `validated` (so a revoked or unapproved device can no
   * longer use previously issued tokens).
   */
  async validateToken(token: string): Promise<UserEntity | null> {
    try {
      const payload = JSON.parse(this.cryptoService.decrypt(token)) as {
        sub: number;
        h: string;
        d?: string;
      };
      const user = await this.users.findOne({ where: { id: payload.sub } });
      if (!user) return null;
      // Tie the token to the current password hash so a password change
      // invalidates previously issued tokens.
      if (payload.h !== user.passwordHash) return null;
      // Device binding: tokens issued before the device feature (no `d`) and
      // tokens whose device is no longer validated are rejected.
      if (!payload.d) return null;
      const device = await this.deviceService.findByDeviceId(user.id, payload.d);
      if (!device || device.status !== 'validated') return null;
      return user;
    } catch {
      return null;
    }
  }

  private issueToken(user: UserEntity, deviceId: string): string {
    const payload = { sub: user.id, h: user.passwordHash, d: deviceId };
    return this.cryptoService.encrypt(JSON.stringify(payload));
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function generatePassword(length = 20): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}
