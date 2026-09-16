import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { CodepodEntity } from '../codepod/codepod.entity';
import { SkillSourceEntity } from './skill-source.entity';

/** A discovered/managed skill within a source. */
@Entity('skills')
@Unique(['sourceId', 'name'])
export class SkillEntity {
  @PrimaryGeneratedColumn() id!: number;

  @Column({ default: 1 }) codepodId!: number;

  @ManyToOne(() => CodepodEntity)
  @JoinColumn({ name: 'codepodId' })
  codepod!: CodepodEntity;

  @Column() sourceId!: number;

  @ManyToOne(() => SkillSourceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceId' })
  source!: SkillSourceEntity;

  /** 'local' | 'repo' | 'skill' (denormalized). */
  @Column({ type: 'text' }) sourceType!: string;

  @Column() name!: string;

  @Column({ type: 'text', nullable: true }) description!: string | null;

  @Column({ type: 'text', nullable: true }) path!: string | null;

  @Column({ type: 'text', nullable: true }) skillMd!: string | null;

  /** True for local skills the user uploaded (vs auto-discovered). */
  @Column({ default: false }) uploaded!: boolean;

  @Column({ type: 'datetime' }) lastSeenAt!: Date;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}