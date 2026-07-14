import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '@users/entities/user.entity';

export enum EmailProvider {
  GMAIL = 'GMAIL',
  OUTLOOK = 'OUTLOOK',
}

@Entity('email_connections')
export class EmailConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, (user) => user.emailConnections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: EmailProvider })
  provider: EmailProvider;

  @Column()
  email: string;

  @Column({ type: 'text' })
  accessToken: string;

  @Column({ type: 'text', nullable: true })
  refreshToken: string;

  @Column({ nullable: true })
  tokenExpiresAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  syncAttemptCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
