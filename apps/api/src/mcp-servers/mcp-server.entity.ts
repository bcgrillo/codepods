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

@Entity('mcp_servers')
@Unique(['codepodId', 'slug'])
export class McpServerEntity {
  @PrimaryGeneratedColumn() id!: number;

  @Column({ default: 1 }) codepodId!: number;

  @ManyToOne(() => CodepodEntity)
  @JoinColumn({ name: 'codepodId' })
  codepod!: CodepodEntity;

  /** Human-readable name, e.g. "GitHub MCP". */
  @Column() name!: string;

  /** URL-safe unique slug used as tool-name prefix. */
  @Column() slug!: string;

  /** 'http' (v1) or 'stdio' (deferred). */
  @Column({ type: 'text', default: 'http' }) transport!: string;

  /** Remote MCP endpoint URL (http transport). */
  @Column({ type: 'text', nullable: true }) url!: string | null;

  /** Linked credential (FK → credentials). Nullable. */
  @Column({ type: 'integer', nullable: true }) credentialId!: number | null;

  @Column({ default: true }) enabled!: boolean;

  /** Built-in CodePods MCP — not deletable, not editable transport/url. */
  @Column({ default: false }) builtIn!: boolean;

  /** When true, automatically connected to every new agent. */
  @Column({ default: false }) connectAllAgents!: boolean;

  /** Pin/order: 0 = unpinned, 1+ = pinned position. */
  @Column({ default: 0 }) sortOrder!: number;

  @CreateDateColumn() createdAt!: Date;

  @UpdateDateColumn() updatedAt!: Date;
}