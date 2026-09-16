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
import type { AgentServiceType } from '@codepods/shared-types';
import { AgentEntity } from './agent.entity';

@Entity('agent_services')
@Unique(['agentId', 'type', 'port'])
@Unique(['agentId', 'name'])
export class AgentServiceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  agentId!: string;

  @ManyToOne(() => AgentEntity)
  @JoinColumn({ name: 'agentId' })
  agent!: AgentEntity;

  @Column({ default: 1 })
  codepodId!: number;

  @Column({ type: 'text' })
  type!: AgentServiceType;

  @Column({ type: 'text' })
  name!: string;

  @Column()
  port!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
