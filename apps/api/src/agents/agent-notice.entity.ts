import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { AgentNoticeSeverity } from '@codepods/shared-types';
import { AgentEntity } from './agent.entity';

@Entity('agent_notices')
export class AgentNoticeEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  agentId!: string;

  @ManyToOne(() => AgentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agentId' })
  agent!: AgentEntity;

  @Column({ type: 'text', default: 'info' })
  severity!: AgentNoticeSeverity;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'text', nullable: true })
  actionLabel!: string | null;

  @Column({ type: 'text', nullable: true })
  actionText!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  dismissedAt!: Date | null;
}