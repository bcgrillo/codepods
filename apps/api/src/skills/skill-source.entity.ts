import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { CodepodEntity } from '../codepod/codepod.entity';

/** A source of skills: the built-in local directory, a remote repo of many skills, or a remote single-skill repo. */
@Entity('skill_sources')
@Unique(['codepodId', 'name'])
export class SkillSourceEntity {
  @PrimaryGeneratedColumn() id!: number;

  @Column({ default: 1 }) codepodId!: number;

  @ManyToOne(() => CodepodEntity)
  @JoinColumn({ name: 'codepodId' })
  codepod!: CodepodEntity;

  /** 'local' | 'repo' | 'skill'. */
  @Column({ type: 'text' }) type!: string;

  @Column() name!: string;

  @Column({ type: 'text', nullable: true }) gitUrl!: string | null;

  /** Sub-path within the repo (for repo/skill types). */
  @Column({ type: 'text', nullable: true }) subPath!: string | null;

  @Column({ type: 'text', nullable: true }) branch!: string | null;

  /** Last synced commit SHA (for repo/skill types). */
  @Column({ type: 'text', nullable: true }) commitSha!: string | null;

  @Column({ type: 'datetime', nullable: true }) lastSyncedAt!: Date | null;

  @Column({ default: true }) enabled!: boolean;

  /** True for the built-in local source (not deletable). */
  @Column({ default: false }) builtIn!: boolean;

  /** Pin/order: 0 = unpinned, 1+ = pinned position. */
  @Column({ default: 0 }) sortOrder!: number;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}