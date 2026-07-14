import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '@users/entities/user.entity';

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, (user) => user.savedJobs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  title: string;

  @Column()
  company: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  salary: string;

  @Column({ nullable: true })
  contractType: string;

  @Column({ nullable: true })
  url: string;

  @Column()
  source: string;

  @Column({ nullable: true })
  externalId: string;

  @Column({ type: 'float', nullable: true })
  matchScore: number;

  @Column({ nullable: true, type: 'jsonb' })
  matchDetails: Record<string, any>;

  @Column({ default: false })
  isSaved: boolean;

  @Column({ default: false })
  isApplied: boolean;

  @Column({ nullable: true })
  publishedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
