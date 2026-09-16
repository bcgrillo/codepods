import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { CodepodEntity } from '../codepod/codepod.entity';

@Entity('agents')
@Unique(['codepodId', 'name'])
export class AgentEntity {
  /** 12-char Docker short container ID */
  @PrimaryColumn()
  id!: string;

  /** Full Docker container ID */
  @Column()
  containerId!: string;

  @Column()
  name!: string;

  @Column()
  image!: string;

  @Column({ default: 1 })
  codepodId!: number;

  @ManyToOne(() => CodepodEntity)
  @JoinColumn({ name: 'codepodId' })
  codepod!: CodepodEntity;

  @Column({ type: 'integer', nullable: true })
  imageTemplateId!: number | null;

  /** JSON-encoded Record<string,string> of environment variables */
  @Column({ type: 'text', nullable: true })
  envVars!: string | null;

  /** JSON-encoded AgentCommandMeta of executed manifest commands */
  @Column({ type: 'text', nullable: true })
  commandMeta!: string | null;

  /** Creation log captured during agent creation (image ensure + set_provider output) */
  @Column({ type: 'text', nullable: true })
  creationLog!: string | null;

  /** Associated workspace ID (nullable — not every agent has a workspace). */
  @Column({ type: 'integer', nullable: true })
  workspaceId!: number | null;

  /** JSON-encoded DockerRunConfig snapshot effective at creation time. */
  @Column({ type: 'text', nullable: true })
  dockerRunConfig!: string | null;

  /** Host path to the agent's persisted home directory. */
  @Column({ type: 'text', nullable: true })
  homePath!: string | null;

  /** Per-agent logical uid assigned at creation (random in the configured range).
   *  Used as `--user <uid>:<gid>` and granted POSIX ACL access to home + workspace.
   *  Null when `forceNonRootUser` is off (agent runs as the API process's uid). */
  @Column({ type: 'integer', nullable: true })
  agentUid!: number | null;

  /** Per-agent logical gid (paired with agentUid; same value — no separate group). */
  @Column({ type: 'integer', nullable: true })
  agentGid!: number | null;

  /** JSON-encoded PortBinding[] snapshot for container recreation. */
  @Column({ type: 'text', nullable: true })
  portBindings!: string | null;

  /** Manual sort order (drag-and-drop). 0 = no forced order (alphabetical fallback). */
  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
