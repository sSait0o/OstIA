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
import { encryptedStringTransformer } from '@common/encrypted.transformer';

export enum ApplicationStatus {
  APPLIED = 'APPLIED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  INTERVIEW = 'INTERVIEW',
  TECHNICAL = 'TECHNICAL',
  OFFER = 'OFFER',
  REJECTED = 'REJECTED',
}

export enum ApplicationSource {
  EMAIL = 'EMAIL',
  MANUAL = 'MANUAL',
  JOB_BOARD = 'JOB_BOARD',
}

@Entity('applications')
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, (user) => user.applications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', transformer: encryptedStringTransformer })
  company: string;

  @Column({ type: 'text', transformer: encryptedStringTransformer })
  jobTitle: string;

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    default: ApplicationStatus.APPLIED,
  })
  status: ApplicationStatus;

  @Column({
    type: 'enum',
    enum: ApplicationSource,
    default: ApplicationSource.MANUAL,
  })
  source: ApplicationSource;

  @Column({ nullable: true })
  emailId: string;

  @Index()
  @Column({ nullable: true })
  threadId: string;

  @Column({
    nullable: true,
    type: 'text',
    transformer: encryptedStringTransformer,
  })
  emailSubject: string;

  @Column({
    nullable: true,
    type: 'text',
    transformer: encryptedStringTransformer,
  })
  emailBody: string;

  @Column({ nullable: true })
  jobUrl: string;

  @Column({
    nullable: true,
    type: 'text',
    transformer: encryptedStringTransformer,
  })
  location: string;

  @Column({ nullable: true })
  salary: string;

  @Column({
    nullable: true,
    type: 'text',
    transformer: encryptedStringTransformer,
  })
  notes: string;

  @Column({ nullable: true, type: 'float' })
  lat: number | null;

  @Column({ nullable: true, type: 'float' })
  lon: number | null;

  @Column({ nullable: true, type: 'varchar' })
  resolvedLocation: string | null;

  @Column({ nullable: true })
  appliedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
