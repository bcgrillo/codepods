import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type DeviceStatus = 'pending' | 'validated' | 'revoked';

/**
 * A device (browser/agent) that has logged in for a given user. New devices
 * start as `pending` and must be approved from the host terminal (CLI) before
 * they can obtain an auth token.
 */
@Entity('devices')
@Index(['userId', 'deviceId'], { unique: true })
export class DeviceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Owning user (FK to users.id). */
  @Column()
  userId!: number;

  /** Opaque token stored in the device cookie. */
  @Column()
  deviceId!: string;

  /** Optional human-readable device label (e.g. user-agent). */
  @Column({ default: '' })
  name!: string;

  @Column({ default: 'pending' })
  status!: DeviceStatus;

  /** Hash of the 6-char approval code (scrypt). Null once validated. */
  @Column({ type: 'text', nullable: true, unique: true })
  codeHash!: string | null;

  @Column({ type: 'datetime', nullable: true })
  codeExpiresAt!: Date | null;

  /** Consecutive failed approval attempts (brute-force tracking). */
  @Column({ default: 0 })
  failedAttempts!: number;

  /** When set, approval attempts are rejected until this time. */
  @Column({ type: 'datetime', nullable: true })
  lockedUntil!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastAttemptAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /** Last time this device successfully authenticated (login or token validation). */
  @Column({ type: 'datetime', nullable: true })
  lastLoginAt!: Date | null;
}
