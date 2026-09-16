import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AiProviderEntity } from './ai-provider.entity';

@Entity('ai_models')
export class AiModelEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  providerId!: number;

  @ManyToOne(() => AiProviderEntity, (p) => p.models, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider!: AiProviderEntity;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  displayName!: string | null;

  @Column({ default: false })
  isDefault!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}