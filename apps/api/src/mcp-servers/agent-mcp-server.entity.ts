import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AgentEntity } from '../agents/agent.entity';
import { McpServerEntity } from './mcp-server.entity';

/** N:M junction — which MCP servers are connected to which agents. */
@Entity('agent_mcp_servers')
@Unique(['agentId', 'mcpServerId'])
@Index(['mcpServerId'])
export class AgentMcpServerEntity {
  @PrimaryGeneratedColumn() id!: number;

  @Column() agentId!: string;

  @ManyToOne(() => AgentEntity)
  @JoinColumn({ name: 'agentId' })
  agent!: AgentEntity;

  @Column() mcpServerId!: number;

  @ManyToOne(() => McpServerEntity)
  @JoinColumn({ name: 'mcpServerId' })
  mcpServer!: McpServerEntity;

  @CreateDateColumn() createdAt!: Date;
}