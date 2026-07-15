import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '@users/entities/user.entity';
import { EmailProvider } from '@email/entities/email-connection.entity';
import { Application, ApplicationStatus } from './application.entity';
import { encryptedStringTransformer } from '../../common/encrypted.transformer';

@Entity('application_emails')
@Unique(['application', 'provider', 'externalMessageId'])
export class ApplicationEmail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application: Application;

  @Column({ type: 'enum', enum: EmailProvider })
  provider: EmailProvider;

  @Column()
  externalMessageId: string;

  @Column({
    type: 'text',
    nullable: true,
    transformer: encryptedStringTransformer,
  })
  subject: string | null;

  @Column({
    type: 'text',
    nullable: true,
    transformer: encryptedStringTransformer,
  })
  body: string | null;

  @Column({ type: 'enum', enum: ApplicationStatus, nullable: true })
  statusDetected: ApplicationStatus | null;

  @Column({ type: 'timestamp', nullable: true })
  receivedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
