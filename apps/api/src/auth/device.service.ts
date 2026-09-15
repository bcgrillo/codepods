import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { DeviceEntity, DeviceStatus } from './device.entity';

/** Length of the approval code. */
export const CODE_LENGTH = 6;
/** How long a pending code stays valid. */
export const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
/** Max failed approval attempts before a device is locked. */
export const MAX_DEVICE_ATTEMPTS = 5;
/** Lock duration after too many failed attempts. */
export const LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
/** Global max failed approvals per window (defense against code brute force). */
export const MAX_GLOBAL_ATTEMPTS = 10;
export const GLOBAL_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Ambiguity-free alphabet: no 0/O, 1/I/L.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface ApproveResult {
  ok: boolean;
  message: string;
}

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);
  /** In-memory sliding window of recent failed global approval attempts. */
  private readonly globalFailures: number[] = [];

  constructor(
    @InjectRepository(DeviceEntity)
    private readonly devices: Repository<DeviceEntity>,
  ) {}

  /** Generates a new 6-char approval code (digits + letters). */
  generateCode(): string {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return code;
  }

  /**
   * Returns the device for a user+deviceId, or null when unknown.
   */
  async findByDeviceId(userId: number, deviceId: string): Promise<DeviceEntity | null> {
    return this.devices.findOne({ where: { userId, deviceId } });
  }

  /**
   * Creates a new pending device for a user and returns it with a fresh code.
   */
  async createPending(
    userId: number,
    deviceId: string,
    name: string,
  ): Promise<{ device: DeviceEntity; code: string }> {
    const code = this.generateCode();
    const device = this.devices.create({
      userId,
      deviceId,
      name,
      status: 'pending',
      codeHash: hashCode(code),
      codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    await this.devices.save(device);
    return { device, code };
  }

  /**
   * Refreshes the code for an existing pending device (e.g. re-login before
   * approval). Returns the new code.
   */
  async refreshPendingCode(device: DeviceEntity): Promise<string> {
    const code = this.generateCode();
    device.codeHash = hashCode(code);
    device.codeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
    await this.devices.save(device);
    return code;
  }

  /**
   * Approves a pending device using its 6-char code. Enforces per-device and
   * global brute-force limits and logs every attempt for tracing.
   */
  async approve(code: string): Promise<ApproveResult> {
    const normalized = (code || '').trim().toUpperCase();
    if (!normalized) {
      return { ok: false, message: 'No code provided.' };
    }

    // Global brute-force guard: too many failed approvals in the window.
    if (this.isGloballyRateLimited()) {
      this.logger.warn(`[device] approval rejected: global rate limit reached`);
      return {
        ok: false,
        message: 'Too many failed attempts. Try again later.',
      };
    }

    // Find the pending device whose stored code matches. We can't look up by
    // hash (each stored hash has its own random salt), so we verify the code
    // against every pending device's stored hash.
    const pending = await this.devices.find({ where: { status: 'pending' } });
    const device = pending.find((d) => d.codeHash && verifyCode(normalized, d.codeHash));

    if (!device) {
      this.recordGlobalFailure();
      this.logger.warn(`[device] approval failed: unknown code`);
      return { ok: false, message: 'Invalid code.' };
    }

    if (device.status !== 'pending') {
      this.logger.warn(`[device] approval failed: device ${device.id} not pending`);
      return { ok: false, message: 'Device is not pending validation.' };
    }

    if (device.lockedUntil && device.lockedUntil.getTime() > Date.now()) {
      this.logger.warn(`[device] approval failed: device ${device.id} locked`);
      return { ok: false, message: 'Device is locked. Try again later.' };
    }

    if (device.codeExpiresAt && device.codeExpiresAt.getTime() < Date.now()) {
      await this.recordDeviceFailure(device);
      this.logger.warn(`[device] approval failed: code expired for device ${device.id}`);
      return { ok: false, message: 'Code expired. Log in again to get a new one.' };
    }

    // Valid code: validate the device.
    device.status = 'validated';
    device.failedAttempts = 0;
    device.lockedUntil = null;
    device.codeHash = null;
    device.codeExpiresAt = null;
    device.lastAttemptAt = new Date();
    device.lastLoginAt = new Date();
    await this.devices.save(device);
    this.logger.log(`[device] approved device ${device.id} (${device.name || 'unnamed'})`);
    return { ok: true, message: 'Device validated.' };
  }

  /** Marks a device as revoked (e.g. future management UI). */
  async revoke(deviceId: string): Promise<void> {
    await this.devices.update({ deviceId }, { status: 'revoked' });
  }

  /** Lists all devices for a user. */
  async listByUser(userId: number): Promise<DeviceEntity[]> {
    return this.devices.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /** Updates the last login timestamp for a device. */
  async updateLastLogin(userId: number, deviceId: string): Promise<void> {
    await this.devices.update({ userId, deviceId }, { lastLoginAt: new Date() });
  }

  /** Revokes a device for a specific user (scoped delete). */
  async revokeForUser(userId: number, deviceId: string): Promise<boolean> {
    const device = await this.devices.findOne({ where: { userId, deviceId } });
    if (!device) return false;
    device.status = 'revoked';
    await this.devices.save(device);
    return true;
  }

  private async recordDeviceFailure(device: DeviceEntity): Promise<void> {
    device.failedAttempts += 1;
    device.lastAttemptAt = new Date();
    if (device.failedAttempts >= MAX_DEVICE_ATTEMPTS) {
      device.lockedUntil = new Date(Date.now() + LOCK_WINDOW_MS);
      this.logger.warn(
        `[device] device ${device.id} locked after ${device.failedAttempts} failed attempts`,
      );
    }
    await this.devices.save(device);
  }

  private isGloballyRateLimited(): boolean {
    const now = Date.now();
    this.pruneGlobalFailures(now);
    return this.globalFailures.length >= MAX_GLOBAL_ATTEMPTS;
  }

  private recordGlobalFailure(): void {
    this.pruneGlobalFailures(Date.now());
    this.globalFailures.push(Date.now());
  }

  private pruneGlobalFailures(now: number): void {
    for (let i = this.globalFailures.length - 1; i >= 0; i--) {
      if (now - this.globalFailures[i] > GLOBAL_WINDOW_MS) {
        this.globalFailures.splice(i, 1);
      }
    }
  }
}

function hashCode(code: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(code, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

/** Verifies a plaintext code against a stored `salt:hash` value. */
function verifyCode(code: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(code, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}
