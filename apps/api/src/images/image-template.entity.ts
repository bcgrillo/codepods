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
import type { ImageTemplateManifest } from '@codepods/shared-types';
import { CodepodEntity } from '../codepod/codepod.entity';

@Entity('image_templates')
@Unique(['codepodId', 'repoUrl', 'repoPath', 'branch'])
export class ImageTemplateEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ default: 1 })
  codepodId!: number;

  @ManyToOne(() => CodepodEntity)
  @JoinColumn({ name: 'codepodId' })
  codepod!: CodepodEntity;

  @Column()
  repoUrl!: string;

  @Column({ default: '.' })
  repoPath!: string;

  @Column({ default: 'main' })
  branch!: string;

  @Column('simple-json')
  dockerfiles!: string[];

  @Column('simple-json', { nullable: true })
  manifest!: ImageTemplateManifest | null;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  icon!: string | null;

  @Column({ type: 'text', nullable: true })
  iconDark!: string | null;

  @Column({ type: 'text', nullable: true })
  lastBuiltCommit!: string | null;

  @Column({ type: 'text', nullable: true })
  lastBuiltTag!: string | null;

  @Column({ type: 'text', nullable: true })
  lastBuiltImageRef!: string | null;

  @Column('simple-json', { nullable: true })
  lastBuildOutput!: string[] | null;

  @Column({ type: 'datetime', nullable: true })
  lastBuiltAt!: Date | null;

  @Column({ default: true })
  enabled!: boolean;

  /** Manual sort order (drag-and-drop). 0 = no forced order (alphabetical fallback). */
  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
