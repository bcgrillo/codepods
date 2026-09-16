import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, Index } from 'typeorm';

/** N:M junction: which skills are installed on which agent. */
@Entity('agent_skills')
@Unique(['agentId', 'skillId'])
@Index(['skillId'])
export class AgentSkillEntity {
  @PrimaryGeneratedColumn() id!: number;

  @Column() agentId!: string;

  @Column() skillId!: number;

  @CreateDateColumn() createdAt!: Date;
}