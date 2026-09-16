import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * An AGENTS.md version. The file is always named `AGENTS.md` inside
 * workspaces, but multiple versions can exist with different aliases.
 * Exactly one version is the default (copied into new workspaces unless
 * the user opts out).
 */
@Entity('agents_md')
@Index(['codepodId'])
export class AgentsMdEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ default: 1 })
  codepodId!: number;

  /** Human-friendly alias shown in the UI. */
  @Column()
  alias!: string;

  /** Full markdown content of the AGENTS.md file. */
  @Column({ type: 'text' })
  content!: string;

  /** Whether this version is the default copied into new workspaces. */
  @Column({ default: false })
  isDefault!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}