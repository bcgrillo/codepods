import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import type { WorkspaceType } from '@codepods/shared-types';
import { CodepodEntity } from '../codepod/codepod.entity';

@Entity('workspaces')
@Unique(['codepodId', 'slug'])
export class WorkspaceEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ default: 1 }) codepodId!: number;
  @ManyToOne(() => CodepodEntity)
  @JoinColumn({ name: 'codepodId' })
  codepod!: CodepodEntity;

  @Column() slug!: string;
  @Column() name!: string;
  @Column({ type: 'text', default: 'local' }) type!: WorkspaceType;
  @Column({ type: 'text', nullable: true }) remoteUrl!: string | null;
  @Column({ type: 'integer', nullable: true }) credentialId!: number | null;
  @Column({ type: 'text', nullable: true }) branch!: string | null;

  /** Manual sort order (drag-and-drop). 0 = no forced order (alphabetical fallback). */
  @Column({ type: 'integer', default: 0 }) sortOrder!: number;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}