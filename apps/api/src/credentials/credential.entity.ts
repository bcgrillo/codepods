import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CodepodEntity } from '../codepod/codepod.entity';

@Entity('credentials')
@Unique(['codepodId', 'label'])
export class CredentialEntity {
  @PrimaryGeneratedColumn() id!: number;

  @Column({ default: 1 }) codepodId!: number;

  @ManyToOne(() => CodepodEntity)
  @JoinColumn({ name: 'codepodId' })
  codepod!: CodepodEntity;

  /** Human-readable name, e.g. "GitHub PAT" or "OpenAI key". */
  @Column() label!: string;

  /** 'key' = bare token; 'user_pass' = username + password/token. */
  @Column({ type: 'text', default: 'key' }) type!: string;

  /** Optional host for scoping/reuse hints (e.g. "github.com"). */
  @Column({ type: 'text', nullable: true }) host!: string | null;

  /** Username for user_pass type; null for key type. */
  @Column({ type: 'text', nullable: true }) username!: string | null;

  /** AES-256-GCM ciphertext of the secret (token/password/key). */
  @Column({ type: 'text', nullable: true }) secret!: string | null;

  @CreateDateColumn() createdAt!: Date;

  @UpdateDateColumn() updatedAt!: Date;
}