import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ApplicationStatus {
  APPLIED = 'APPLIED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  INTERVIEW = 'INTERVIEW',
  TECHNICAL = 'TECHNICAL',
  OFFER = 'OFFER',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
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

  @ManyToOne(() => User, (user) => user.applications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  company: string;

  @Column()
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

  @Column({ nullable: true, length: 500 })
  emailSubject: string;

  @Column({ nullable: true, type: 'text' })
  emailBody: string;

  @Column({ nullable: true })
  jobUrl: string;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  salary: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ nullable: true, type: 'float' })
  lat: number;

  @Column({ nullable: true, type: 'float' })
  lon: number;

  @Column({ nullable: true })
  resolvedLocation: string;

  @Column({ nullable: true })
  appliedAt: Date;

  @Column({ nullable: true })
  lastContactAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
