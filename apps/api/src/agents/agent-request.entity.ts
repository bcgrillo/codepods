import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type {
  AgentRequestType,
  AgentRequestStatus,
  AgentRequestPayload,
} from '@codepods/shared-types';
import { AgentEntity } from './agent.entity';

@Entity('agent_requests')
export class AgentRequestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  agentId!: string;

  @ManyToOne(() => AgentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agentId' })
  agent!: AgentEntity;

  @Column({ type: 'text', default: 'whitelist' })
  type!: AgentRequestType;

  @Column({ type: 'text', default: 'pending' })
  status!: AgentRequestStatus;

  @Column({ type: 'simple-json' })
  payload!: AgentRequestPayload;

  @Column({ type: 'text' })
  reason!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  resolvedBy!: string | null;

  @Column({ type: 'datetime', nullable: true })
  expiresAt!: Date | null;
}