import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('users')
@Unique(['username'])
export class UserEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  username!: string;

  /** Role of the user. `owner` is the built-in administrator. */
  @Column({ default: 'owner' })
  role!: string;

  /**
   * Password hash stored as `salt:hash` (scrypt). Never stores the plaintext.
   */
  @Column()
  passwordHash!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
