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

@Entity('managed_apis')
@Unique(['codepodId', 'name'])
export class ManagedApiEntity {
  @PrimaryGeneratedColumn() id!: number;

  @Column({ default: 1 }) codepodId!: number;

  @ManyToOne(() => CodepodEntity)
  @JoinColumn({ name: 'codepodId' })
  codepod!: CodepodEntity;

  @Column() name!: string;

  @Column({ type: 'text', nullable: true }) description!: string | null;

  @Column({ type: 'text' }) baseUrl!: string;

  @Column({ type: 'integer', nullable: true }) credentialId!: number | null;

  @Column({ type: 'text' }) headerPattern!: string;

  @Column({ default: true }) enabled!: boolean;

  @CreateDateColumn() createdAt!: Date;

  @UpdateDateColumn() updatedAt!: Date;
}