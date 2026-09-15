import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CodepodEntity } from '../codepod/codepod.entity';
import { AiModelEntity } from './ai-model.entity';

@Entity('ai_providers')
@Unique(['codepodId', 'slug'])
export class AiProviderEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ default: 1 })
  codepodId!: number;

  @ManyToOne(() => CodepodEntity)
  @JoinColumn({ name: 'codepodId' })
  codepod!: CodepodEntity;

  @Column()
  name!: string;

  @Column()
  slug!: string;

  @Column({ default: 'openai' })
  type!: string;

  @Column()
  baseUrl!: string;

  /** Environment variable name holding the API key. */
  @Column({ type: 'text', nullable: true })
  apiKeyEnvVar!: string | null;

  /** Linked unified credential (FK → credentials.id). The proxy resolves the
   * secret from the credential store. Lets any credential (incl. git user_pass)
   * be reused for an AI provider. */
  @Column({ type: 'integer', nullable: true })
  credentialId!: number | null;

  /** True when this is the default provider for its codepod. */
  @Column({ default: false })
  isDefault!: boolean;

  /** Disabled providers are invisible to the proxy and set_provider dropdowns. */
  @Column({ default: true })
  enabled!: boolean;

  @Column({ type: 'integer', nullable: true })
  fallbackModelId!: number | null;

  @OneToMany(() => AiModelEntity, (m) => m.provider, {
    cascade: true,
    eager: true,
  })
  models!: AiModelEntity[];

  /** Manual sort order (drag-and-drop). 0 = no forced order (alphabetical fallback). */
  @Column({ type: 'integer', default: 0 })
  sortOrder!: number;

  /** Provider icon URL (light theme). Populated from discovered providers. */
  @Column({ type: 'text', nullable: true })
  iconUrl!: string | null;

  /** Provider icon URL (dark theme). Populated from discovered providers. */
  @Column({ type: 'text', nullable: true })
  iconDarkUrl!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}