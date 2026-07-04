import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { EmailProvider } from './email-connection.entity';
import { Application } from '../../applications/entities/application.entity';

export enum EmailSyncStatus {
  CREATED = 'CREATED',
  DUPLICATE = 'DUPLICATE',
  NOT_RELEVANT = 'NOT_RELEVANT',
  FAILED = 'FAILED',
}

@Entity('email_sync_records')
@Unique(['user', 'provider', 'externalMessageId'])
export class EmailSyncRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: EmailProvider })
  provider: EmailProvider;

  @Column()
  externalMessageId: string;

  @Column({ type: 'enum', enum: EmailSyncStatus })
  status: EmailSyncStatus;

  @ManyToOne(() => Application, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'application_id' })
  application: Application | null;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  reason: string | null;

  @Column({ type: 'int', default: 1 })
  attemptCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
